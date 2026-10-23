import { sql } from "./db";

// Cost of goods from the team's Profit-Sheet app. Profit-Sheet reads supplier invoices with
// Claude and matches them to Shopify orders; its /api/export/cogs endpoint returns, per order
// line, the order's cost (supplier-invoiced, or estimated from its SKU cost list).

const IMPORT_DAYS = Number(process.env.PROFIT_SHEET_IMPORT_DAYS ?? 180);
const AVG_DAYS = 90; // window for a product's average invoiced cost per unit

export const profitSheetConfigured = () => Boolean(process.env.PROFIT_SHEET_URL && process.env.PROFIT_SHEET_KEY);

export type ExportRow = {
  orderId: string;
  orderDate: string;
  cogsSource: string; // "invoice" | "estimate"
  orderCogsBase: number | null; // whole order: products + shipping + other when invoiced
  lineId: string; // gid://shopify/LineItem/123
  sku: string;
  quantity: number;
  unitCostBase: number | null; // SKU cost estimate
};

const lineNumber = (gid: string) => {
  const id = gid.slice(gid.lastIndexOf("/") + 1);
  return /^\d+$/.test(id) ? id : null;
};

async function fetchStore(shop: string) {
  const since = new Date(Date.now() - IMPORT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const rows: ExportRow[] = [];
  let currency = "USD";
  let after = "";
  for (let page = 0; page < 100; page++) {
    const url = new URL("/api/export/cogs", process.env.PROFIT_SHEET_URL);
    url.searchParams.set("shop", shop);
    url.searchParams.set("since", since);
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { authorization: `Bearer ${process.env.PROFIT_SHEET_KEY}` }, cache: "no-store" });
    if (res.status === 404) return null; // store isn't in Profit-Sheet
    if (res.status === 401) throw new Error("Profit-Sheet rejected the key (PROFIT_SHEET_KEY must match COGS_EXPORT_KEY there)");
    if (!res.ok) throw new Error(`Profit-Sheet export failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { currency: string; rows: ExportRow[]; next: string | null };
    currency = body.currency;
    rows.push(...body.rows);
    if (!body.next) break;
    after = body.next;
  }
  return { currency, rows };
}

/**
 * Cost per line in Profit-Sheet's currency. An invoiced order's cost is split across its lines by
 * the SKU estimates when every line has one, else by each line's sale price, else by quantity.
 */
export function lineCosts(rows: ExportRow[], revenueByLine: Map<string, number>) {
  const byOrder = new Map<string, ExportRow[]>();
  for (const r of rows) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]);

  const out: { id: string; cost: number | null; source: string }[] = [];
  for (const lines of byOrder.values()) {
    const { cogsSource, orderCogsBase } = lines[0];
    if (cogsSource === "invoice" && orderCogsBase !== null) {
      const estimates = lines.map((l) => (l.unitCostBase === null ? null : l.unitCostBase * l.quantity));
      const revenues = lines.map((l) => revenueByLine.get(lineNumber(l.lineId) ?? "") ?? 0);
      const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
      const weights = estimates.every((e) => e !== null) && sum(estimates as number[]) > 0
        ? (estimates as number[])
        : sum(revenues) > 0
          ? revenues
          : lines.map((l) => l.quantity);
      const total = sum(weights);
      lines.forEach((l, i) => {
        const id = lineNumber(l.lineId);
        if (id) out.push({ id, cost: total > 0 ? (orderCogsBase * weights[i]) / total : null, source: "invoice" });
      });
    } else {
      for (const l of lines) {
        const id = lineNumber(l.lineId);
        if (id) out.push({ id, cost: l.unitCostBase === null ? null : l.unitCostBase * l.quantity, source: "sheet_estimate" });
      }
    }
  }
  return out;
}

async function importStore(store: { id: number; shop_domain: string }) {
  const data = await fetchStore(store.shop_domain);
  if (!data) return { skipped: "not in Profit-Sheet" };

  const ids = [...new Set(data.rows.map((r) => lineNumber(r.lineId)).filter((x): x is string => x !== null))];
  const revenueByLine = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 10000) {
    const ours = await sql<{ id: string; revenue_shop: string }[]>`
      select id::text, revenue_shop from order_lines
      where store_id = ${store.id} and id = any(${ids.slice(i, i + 10000)}::bigint[])`;
    for (const o of ours) revenueByLine.set(o.id, Number(o.revenue_shop));
  }
  const costs = lineCosts(data.rows, revenueByLine).filter((c) => c.cost !== null);

  return sql.begin(async (tx) => {
    // Start from a clean slate for the window, so a deleted invoice falls back to the estimate.
    await tx`
      update order_lines set ext_cogs = null, ext_cogs_source = null
      where store_id = ${store.id} and day >= current_date - ${IMPORT_DAYS}::int and ext_cogs_source is not null`;

    let matched = 0;
    for (let i = 0; i < costs.length; i += 5000) {
      const chunk = costs.slice(i, i + 5000);
      const res = await tx`
        update order_lines o set
          ext_cogs = v.cost * fx(${data.currency}, s.shop_currency, o.day),
          ext_cogs_source = v.source
        from unnest(${chunk.map((c) => c.id)}::bigint[], ${chunk.map((c) => c.cost)}::numeric[],
                    ${chunk.map((c) => c.source)}::text[]) as v(id, cost, source),
             stores s
        where o.store_id = ${store.id} and o.id = v.id and s.id = o.store_id`;
      matched += res.count;
    }

    // Each product's average invoiced cost per unit over recent invoiced orders...
    await tx`update products set invoiced_unit_cost = null where store_id = ${store.id}`;
    await tx`
      update products p set invoiced_unit_cost = a.unit_cost
      from (
        select product_id, sum(ext_cogs) / nullif(sum(quantity), 0) as unit_cost
        from order_lines
        where store_id = ${store.id} and ext_cogs_source = 'invoice' and not cancelled
          and day >= current_date - ${AVG_DAYS}::int
        group by product_id
      ) a
      where p.store_id = ${store.id} and p.id = a.product_id`;

    // ...stands in for orders that aren't invoiced yet (better than a SKU estimate without shipping).
    const filled = await tx`
      update order_lines o set ext_cogs = o.quantity * p.invoiced_unit_cost, ext_cogs_source = 'invoice_avg'
      from products p
      where o.store_id = ${store.id} and p.store_id = o.store_id and p.id = o.product_id
        and p.invoiced_unit_cost is not null
        and o.day >= current_date - ${IMPORT_DAYS}::int
        and (o.ext_cogs_source is null or o.ext_cogs_source = 'sheet_estimate')`;

    await tx`update stores set cogs_imported_at = now(), cogs_import_error = null where id = ${store.id}`;
    return { lines: data.rows.length, matched, filledFromAverage: filled.count };
  });
}

/** Imports cost of goods for every store that also exists in Profit-Sheet (matched by .myshopify.com domain). */
export async function importProfitSheetCogs(storeIds?: number[]) {
  if (!profitSheetConfigured()) return { skipped: "PROFIT_SHEET_URL / PROFIT_SHEET_KEY not set" };
  const stores = await sql<{ id: number; name: string; shop_domain: string }[]>`
    select id, name, shop_domain from stores ${storeIds ? sql`where id = any(${storeIds}::int[])` : sql``}`;
  const results = [];
  for (const store of stores) {
    try {
      results.push({ store: store.name, ...(await importStore(store)) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await sql`update stores set cogs_import_error = ${message} where id = ${store.id}`;
      results.push({ store: store.name, error: message });
    }
  }
  return { results };
}
