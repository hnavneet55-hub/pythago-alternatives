import { getReport, type ReportRow } from "@/lib/report";
import { getStoreSummaries, parseParams, resolveScope, isoDay } from "@/lib/dashboard";

// Store performance report in the same layout as Pythago's product performance export:
// one row per product, with 30-, 14- and 7-day blocks ending on the selected end date.
// "Conversion Value" is Shopify revenue minus refunds and ROAS is that divided by ad spend,
// as in Pythago's file. All amounts are in the view's currency.

const WINDOWS = [30, 14, 7] as const;

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const money = (v: number) => v.toFixed(2);
const ratio = (a: number, b: number, digits = 2) => (b ? (a / b).toFixed(digits) : "");
const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function GET(request: Request) {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const params = parseParams(sp);
  const stores = await getStoreSummaries();
  const scope = resolveScope(stores, params.stores, params.cur);
  const cur = scope.currency;
  const byId = new Map(stores.map((s) => [s.id, s]));

  const reports = await Promise.all(
    WINDOWS.map((n) =>
      getReport({ storeIds: scope.storeIds, currency: cur, from: shift(params.to, -(n - 1)), to: params.to, country: params.country }),
    ),
  );
  const index = reports.map((rows) => new Map(rows.map((r) => [`${r.store_id}:${r.key_id}`, r])));
  const [r30] = reports;
  r30.sort((a, b) => b.cost - a.cost);

  const multi = scope.storeIds.length > 1;
  const header = [
    ...(multi ? ["Store"] : []),
    "Product Name", "External ID", "Status", "Variant Count", "Tags", "Published At",
    `Cost (30d) [${cur}]`, "Impressions (30d)", "Clicks (30d)", "CTR (30d)", `CPC (30d) [${cur}]`, `CPA (30d) [${cur}]`,
    "Conversions (30d)", `Conversion Value (30d) [${cur}]`, "Offline Quantity (30d)", `Offline Revenue (30d) [${cur}]`,
    `Offline Refunds (30d) [${cur}]`, "ROAS (30d)",
    ...([14, 7] as const).flatMap((n) => [
      `Cost (${n}d) [${cur}]`, `Impressions (${n}d)`, `Clicks (${n}d)`, `CTR (${n}d)`, `Conversion Value (${n}d) [${cur}]`,
      `Offline Revenue (${n}d) [${cur}]`, `Offline Refunds (${n}d) [${cur}]`, `ROAS (${n}d)`,
    ]),
    "Currency (Google Ads)", "Currency (Store)",
  ];

  const block = (r: ReportRow | undefined) => {
    const cost = r?.cost ?? 0, rev = r?.revenue ?? 0, refunds = r?.refunds ?? 0, clicks = r?.clicks ?? 0, imp = r?.impressions ?? 0;
    return { cost, rev, refunds, clicks, imp, cv: rev - refunds, ctr: ratio(clicks * 100, imp, 4) };
  };

  const lines = [header.map(cell).join(",")];
  for (const r of r30) {
    const store = byId.get(r.store_id);
    const k = `${r.store_id}:${r.key_id}`;
    const b30 = block(r);
    const rest = ([1, 2] as const).flatMap((i) => {
      const b = block(index[i].get(k));
      return [money(b.cost), b.imp, b.clicks, b.ctr, money(b.cv), money(b.rev), money(b.refunds), ratio(b.cv, b.cost)];
    });
    lines.push(
      [
        ...(multi ? [store?.name] : []),
        r.title, r.product_id, r.status, r.variant_count, r.tags.join(", "), r.published_at,
        money(b30.cost), b30.imp, b30.clicks, b30.ctr, ratio(b30.cost, b30.clicks), ratio(b30.cost, r.conversions),
        r.conversions.toFixed(2), money(b30.cv), r.qty, money(b30.rev), money(b30.refunds), ratio(b30.cv, b30.cost),
        ...rest,
        store?.ads_currency ?? "", store?.shop_currency ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }

  const label = multi ? "All_stores" : (byId.get(scope.storeIds[0])?.name ?? "store").replace(/[^\w-]+/g, "_");
  return new Response("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="product_performance_${label}_${isoDay(0)}.csv"`,
    },
  });
}
