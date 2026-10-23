import { connection } from "next/server";
import { sql } from "./db";
import { getReport, totals, type ReportRow } from "./report";

export type SearchParams = Record<string, string | string[] | undefined>;

export type StoreSummary = {
  id: number;
  name: string;
  shop_domain: string;
  ads_currency: string | null;
  shop_currency: string | null;
  ads_synced_at: Date | null;
  orders_synced_at: Date | null;
  last_sync_error: string | null;
};

export type DashboardRow = ReportRow & {
  store_name: string;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
  roas7: number | null;
  roas14: number | null;
  roas30: number | null;
  profit: number | null; // null when some revenue has no cost of goods
  margin: number | null;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isoDay = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
const div = (a: number, b: number) => (b ? a / b : null);

export function parseParams(sp: SearchParams) {
  const to = isDate(one(sp.to)) ? one(sp.to) : isoDay(1);
  const from = isDate(one(sp.from)) ? one(sp.from) : isoDay(30);
  // ?stores=1,3 (multi-select); ?store=1 is accepted for older links. Empty means all stores.
  const storeList = (one(sp.stores) || one(sp.store))
    .split(",")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
  return {
    stores: storeList,
    cur: one(sp.cur).toUpperCase(),
    from: from <= to ? from : to,
    to,
    country: one(sp.country).toUpperCase() || null,
    status: one(sp.status).toUpperCase() || "",
    tag: one(sp.tag) || "",
    q: one(sp.q).trim(),
    sort: one(sp.sort) || "cost",
    dir: one(sp.dir) === "asc" ? ("asc" as const) : ("desc" as const),
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}
export type Params = ReturnType<typeof parseParams>;

export async function getStoreSummaries() {
  return sql<StoreSummary[]>`
    select id, name, shop_domain, ads_currency, shop_currency, ads_synced_at, orders_synced_at, last_sync_error
    from stores order by name`;
}

export const storeCurrency = (s: StoreSummary) => s.ads_currency ?? s.shop_currency ?? "EUR";

/**
 * Stores in view and the display currency. Stores sharing one Google Ads currency are shown
 * in it; a mix of currencies is converted to `cur` (one of theirs) or REPORTING_CURRENCY.
 */
export function resolveScope(stores: StoreSummary[], storeIds: number[], cur = "") {
  const picked = stores.filter((s) => storeIds.includes(s.id));
  const selected = picked.length ? picked : stores;
  const currencies = [...new Set(selected.map(storeCurrency))].sort();
  const reporting = process.env.REPORTING_CURRENCY ?? "EUR";
  const options = currencies.length > 1 ? [...new Set([reporting, ...currencies])] : currencies;
  const currency = currencies.length === 1 ? currencies[0] : options.includes(cur) ? cur : reporting;
  return {
    storeIds: selected.map((s) => s.id),
    allSelected: picked.length === 0 || picked.length === stores.length,
    currency,
    currencyOptions: options,
    mixed: currencies.length > 1,
    label: picked.length === 0 || picked.length === stores.length ? "All stores" : picked.map((s) => s.name).join(", "),
  };
}

export function derive(r: ReportRow, storeName: string): DashboardRow {
  return {
    ...r,
    store_name: storeName,
    ctr: div(r.clicks, r.impressions),
    cpc: div(r.cost, r.clicks),
    cpa: div(r.cost, r.conversions),
    roas: div(r.revenue, r.cost),
    roas7: div(r.rev7, r.cost7),
    roas14: div(r.rev14, r.cost14),
    roas30: div(r.rev30, r.cost30),
    profit: r.rev_no_cogs > 0.005 ? null : r.revenue - r.refunds - r.cogs - r.cost,
    margin: r.price !== null && r.unit_cost !== null ? r.price - r.unit_cost : null,
  };
}

export function sortRows<T extends Record<string, unknown>>(rows: T[], key: string, dir: "asc" | "desc") {
  const m = dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1; // empty values always last
    if (y === null || y === undefined) return -1;
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y) * m;
    return ((x as number) - (y as number)) * m;
  });
}

export async function loadDashboard(sp: SearchParams) {
  await connection(); // date defaults depend on the current time
  const params = parseParams(sp);
  const stores = await getStoreSummaries();
  const scope = resolveScope(stores, params.stores, params.cur);
  const names = new Map(stores.map((s) => [s.id, s.name]));

  let rows: DashboardRow[] = [];
  if (scope.storeIds.length) {
    const report = await getReport({
      storeIds: scope.storeIds,
      currency: scope.currency,
      from: params.from,
      to: params.to,
      country: params.country,
    });
    rows = report.map((r) => derive(r, names.get(r.store_id) ?? ""));
  }

  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (params.tag) rows = rows.filter((r) => r.tags.includes(params.tag));
  if (params.q) {
    const q = params.q.toLowerCase();
    const byVariant = /^\d+$/.test(q)
      ? new Set(
          (await sql<{ k: string }[]>`
            select store_id || ':' || product_id as k from variants
            where id = ${q}::bigint and store_id = any(${scope.storeIds}::int[])`).map((x) => x.k),
        )
      : new Set<string>();
    rows = rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.product_id === q || byVariant.has(`${r.store_id}:${r.product_id}`),
    );
  }

  sortRows(rows, params.sort, params.dir);

  const allTags = [...new Set(rows.flatMap((r) => r.tags))].sort();
  const lastSync = stores
    .filter((s) => scope.storeIds.includes(s.id))
    .map((s) => s.ads_synced_at)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return { params, stores, scope, rows, totals: totals(rows), allTags, lastSync: lastSync ?? null };
}

export async function getCountries(storeIds: number[]) {
  const rows = await sql<{ country: string }[]>`
    select distinct country from ad_stats where store_id = any(${storeIds}::int[]) and country is not null
    union
    select distinct country from order_lines where store_id = any(${storeIds}::int[]) and country is not null
    order by 1`;
  return rows.map((r) => r.country);
}

/** Builds a URL that keeps the current filters and overrides some of them. */
export function hrefWith(path: string, sp: SearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) next.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}
