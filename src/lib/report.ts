import { sql } from "./db";

export type ReportFilters = {
  storeIds: number[];
  currency: string; // display currency
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive; 7/14/30-day windows end here
  country?: string | null;
  productId?: string | null; // limit to one product (variant breakdown)
};

export type ReportRow = {
  store_id: number;
  key_id: string; // product id, or variant id in variant mode
  product_id: string;
  title: string;
  variant_title: string | null;
  sku: string | null;
  status: string | null;
  image_url: string | null;
  tags: string[];
  variant_count: number;
  price: number | null;
  unit_cost: number | null;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  g_conv_value: number;
  qty: number;
  revenue: number;
  refund_qty: number;
  refunds: number;
  cogs: number;
  rev_no_cogs: number; // revenue with no cost basis (no product override, Shopify cost or store default %)
  cost7: number;
  rev7: number;
  imp7: number;
  cost14: number;
  rev14: number;
  imp14: number;
  cost30: number;
  rev30: number;
  imp30: number;
};

const NUMERIC_KEYS = [
  "price", "unit_cost", "cost", "impressions", "clicks", "conversions", "g_conv_value", "qty", "revenue",
  "refund_qty", "refunds", "cogs", "rev_no_cogs", "cost7", "rev7", "imp7", "cost14", "rev14", "imp14", "cost30", "rev30", "imp30",
] as const;

/**
 * Aggregates Google Ads spend and Shopify sales per product (or per variant when
 * `level` is "variant"), converted into `currency`. Shopify revenue uses the customer's
 * presentment amount when it is already in the display currency, otherwise the shop
 * amount converted with the ECB rate for the order day.
 *
 * Cost of goods per unit: product override, else Shopify "cost per item", else the
 * store's default % of revenue. Revenue with none of these is reported in rev_no_cogs
 * so profit is never computed with a silent zero cost.
 */
export async function getReport(f: ReportFilters, level: "product" | "variant" = "product") {
  const variantMode = level === "variant";
  const country = f.country || null;
  const productId = f.productId || null;
  const cur = f.currency;

  const rows = await sql`
    with
    bounds as (
      select ${f.from}::date as d_from, ${f.to}::date as d_to,
             least(${f.from}::date, ${f.to}::date - 29) as d_min
    ),
    ads as (
      select a.store_id, ${variantMode ? sql`a.variant_id` : sql`a.product_id`} as key_id,
        sum(a.cost * r.rate)       filter (where a.day >= b.d_from) as cost,
        sum(a.impressions)         filter (where a.day >= b.d_from) as impressions,
        sum(a.clicks)              filter (where a.day >= b.d_from) as clicks,
        sum(a.conversions)         filter (where a.day >= b.d_from) as conversions,
        sum(a.conv_value * r.rate) filter (where a.day >= b.d_from) as g_conv_value,
        sum(a.cost * r.rate)       filter (where a.day > b.d_to - 7)  as cost7,
        sum(a.impressions)         filter (where a.day > b.d_to - 7)  as imp7,
        sum(a.cost * r.rate)       filter (where a.day > b.d_to - 14) as cost14,
        sum(a.impressions)         filter (where a.day > b.d_to - 14) as imp14,
        sum(a.cost * r.rate)       filter (where a.day > b.d_to - 30) as cost30,
        sum(a.impressions)         filter (where a.day > b.d_to - 30) as imp30
      from ad_stats a
      join stores s on s.id = a.store_id
      cross join bounds b
      cross join lateral (select fx(s.ads_currency, ${cur}, a.day) as rate) r
      where a.store_id = any(${f.storeIds}::int[])
        and a.day between b.d_min and b.d_to
        and a.product_id is not null
        and (${country}::text is null or a.country = ${country})
        and (${productId}::bigint is null or a.product_id = ${productId}::bigint)
      group by 1, 2
    ),
    sales as (
      select o.store_id, ${variantMode ? sql`o.variant_id` : sql`o.product_id`} as key_id,
        sum(o.quantity)                       filter (where o.day >= b.d_from) as qty,
        sum(x.rev)                            filter (where o.day >= b.d_from) as revenue,
        sum(x.cogs)                           filter (where o.day >= b.d_from) as cogs,
        sum(x.rev)                            filter (where o.day >= b.d_from and x.cogs is null) as rev_no_cogs,
        sum(x.rev) filter (where o.day > b.d_to - 7)  as rev7,
        sum(x.rev) filter (where o.day > b.d_to - 14) as rev14,
        sum(x.rev) filter (where o.day > b.d_to - 30) as rev30
      from order_lines o
      join stores s on s.id = o.store_id
      cross join bounds b
      left join variants v on v.store_id = o.store_id and v.id = o.variant_id
      left join products p on p.store_id = o.store_id and p.id = o.product_id
      cross join lateral (
        select case when o.presentment_currency = ${cur} then o.revenue_presentment
                    else o.revenue_shop * fx(s.shop_currency, ${cur}, o.day) end as rev
      ) r
      cross join lateral (
        select r.rev,
               case when coalesce(p.cogs_override, v.unit_cost) is not null
                      then o.quantity * coalesce(p.cogs_override, v.unit_cost) * fx(s.shop_currency, ${cur}, o.day)
                    when s.default_cogs_pct is not null then r.rev * s.default_cogs_pct / 100
               end as cogs
      ) x
      where o.store_id = any(${f.storeIds}::int[])
        and o.day between b.d_min and b.d_to
        and not o.cancelled
        and o.product_id is not null
        and (${country}::text is null or o.country = ${country})
        and (${productId}::bigint is null or o.product_id = ${productId}::bigint)
      group by 1, 2
    ),
    refunds as (
      select rl.store_id, ${variantMode ? sql`rl.variant_id` : sql`rl.product_id`} as key_id,
        sum(rl.quantity) as refund_qty,
        sum(case when rl.presentment_currency = ${cur} then rl.amount_presentment
                 else rl.amount_shop * fx(s.shop_currency, ${cur}, rl.day) end) as refunds
      from refund_lines rl
      join stores s on s.id = rl.store_id
      cross join bounds b
      where rl.store_id = any(${f.storeIds}::int[])
        and rl.day between b.d_from and b.d_to
        and rl.product_id is not null
        and (${country}::text is null or rl.country = ${country})
        and (${productId}::bigint is null or rl.product_id = ${productId}::bigint)
      group by 1, 2
    ),
    keys as (
      select store_id, key_id from ads union select store_id, key_id from sales
      union select store_id, key_id from refunds
    )
    select
      k.store_id, k.key_id::text as key_id,
      ${variantMode ? sql`v.product_id::text` : sql`k.key_id::text`} as product_id,
      coalesce(p.title, 'Unknown product ' || ${variantMode ? sql`v.product_id` : sql`k.key_id`}) as title,
      ${variantMode ? sql`coalesce(v.title, 'Unknown variant ' || k.key_id)` : sql`null`} as variant_title,
      ${variantMode ? sql`v.sku` : sql`null`} as sku,
      p.status, p.image_url, coalesce(p.tags, '{}') as tags, coalesce(p.variant_count, 0) as variant_count,
      ${variantMode ? sql`v.price` : sql`p.price`} * fx(s.shop_currency, ${cur}, b.d_to) as price,
      coalesce(
        ${variantMode ? sql`coalesce(p.cogs_override, v.unit_cost)` : sql`coalesce(p.cogs_override, pc.avg_cost)`},
        ${variantMode ? sql`v.price` : sql`p.price`} * s.default_cogs_pct / 100
      ) * fx(s.shop_currency, ${cur}, b.d_to) as unit_cost,
      coalesce(a.cost, 0) as cost, coalesce(a.impressions, 0) as impressions, coalesce(a.clicks, 0) as clicks,
      coalesce(a.conversions, 0) as conversions, coalesce(a.g_conv_value, 0) as g_conv_value,
      coalesce(sa.qty, 0) as qty, coalesce(sa.revenue, 0) as revenue, coalesce(sa.cogs, 0) as cogs,
      coalesce(sa.rev_no_cogs, 0) as rev_no_cogs,
      coalesce(rf.refund_qty, 0) as refund_qty, coalesce(rf.refunds, 0) as refunds,
      coalesce(a.cost7, 0) as cost7, coalesce(sa.rev7, 0) as rev7, coalesce(a.imp7, 0) as imp7,
      coalesce(a.cost14, 0) as cost14, coalesce(sa.rev14, 0) as rev14, coalesce(a.imp14, 0) as imp14,
      coalesce(a.cost30, 0) as cost30, coalesce(sa.rev30, 0) as rev30, coalesce(a.imp30, 0) as imp30
    from keys k
    cross join bounds b
    join stores s on s.id = k.store_id
    left join ads a on a.store_id = k.store_id and a.key_id = k.key_id
    left join sales sa on sa.store_id = k.store_id and sa.key_id = k.key_id
    left join refunds rf on rf.store_id = k.store_id and rf.key_id = k.key_id
    ${variantMode ? sql`left join variants v on v.store_id = k.store_id and v.id = k.key_id` : sql``}
    left join products p on p.store_id = k.store_id
      and p.id = ${variantMode ? sql`v.product_id` : sql`k.key_id`}
    left join lateral (
      select avg(unit_cost) as avg_cost from variants vv
      where vv.store_id = k.store_id and vv.product_id = p.id and vv.unit_cost is not null
    ) pc on true
  `;

  return rows.map((r) => {
    const out = { ...r } as Record<string, unknown>;
    for (const key of NUMERIC_KEYS) out[key] = r[key] === null ? null : Number(r[key]);
    out.variant_count = Number(r.variant_count);
    return out as ReportRow;
  });
}

export type Totals = ReturnType<typeof totals>;

export function totals(rows: ReportRow[]) {
  const t = rows.reduce(
    (acc, r) => {
      acc.revNoCogs += r.rev_no_cogs;
      if (r.rev_no_cogs > 0) acc.productsNoCogs += 1;
      acc.cost += r.cost;
      acc.qty += r.qty;
      acc.revenue += r.revenue;
      acc.refunds += r.refunds;
      acc.cogs += r.cogs;
      acc.clicks += r.clicks;
      acc.impressions += r.impressions;
      acc.conversions += r.conversions;
      return acc;
    },
    { cost: 0, qty: 0, revenue: 0, refunds: 0, cogs: 0, clicks: 0, impressions: 0, conversions: 0, revNoCogs: 0, productsNoCogs: 0 },
  );
  // Profit is only meaningful when every sale has a cost basis.
  const cogsComplete = t.revNoCogs < 0.005;
  const netProfit = cogsComplete ? t.revenue - t.refunds - t.cogs - t.cost : null;
  return {
    ...t,
    products: rows.length,
    roas: t.cost ? t.revenue / t.cost : null,
    cogsComplete,
    cogsMissingShare: t.revenue ? t.revNoCogs / t.revenue : 0,
    netProfit,
    poas: netProfit !== null && t.cost ? netProfit / t.cost : null,
  };
}
