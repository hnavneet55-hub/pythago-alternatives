import { Suspense } from "react";
import Link from "next/link";
import { sql } from "@/lib/db";
import { adsScript } from "@/lib/ads-script";
import { timeAgo } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { AddStoreForm, BulkAddForm, CogsForm, CopyBlock, ImportCogsButton, StoreActions, TargetsForm } from "./forms";
import { profitSheetConfigured } from "@/lib/profit-sheet";

export const metadata = { title: "Stores & setup · AdProfit" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Stores &amp; setup</h1>
        <p className="text-sm text-slate-500">
          Each store connects to Shopify (sales, products, costs) and to one Google Ads account through a script (ad spend per SKU).
        </p>
      </div>
      <Link
        href="/guide"
        className="flex items-center justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-900 hover:bg-violet-100"
      >
        <span>
          <strong>First time connecting a store?</strong> Follow the step-by-step setup guide. It covers the Shopify app, adding stores and the
          Google Ads script, with fixes for common errors.
        </span>
        <span className="shrink-0 font-medium">Open setup guide →</span>
      </Link>
      <Suspense fallback={<div className="text-slate-500">Loading stores…</div>}>
        <StoreList />
        <TargetSettings />
        <CogsSettings />
      </Suspense>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="mb-1 font-semibold">Connect a Shopify store</h2>
        <p className="mb-5 text-sm text-slate-600">
          Before filling this in, create the Shopify app and install it on the store:{" "}
          <Link href="/guide#part-1" className="font-medium text-violet-700 hover:underline">
            setup guide, parts 1 and 2
          </Link>
          . To change a store&apos;s credentials, submit this form again with the same Shopify domain. Its data is kept.
        </p>
        <AddStoreForm />
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="mb-1 font-semibold">Bulk add stores</h2>
        <p className="mb-4 text-sm text-slate-600">
          Paste several stores at once, one block per store: the store name on its own line, then its <code>.myshopify.com</code> domain,{" "}
          <code>Client ID - …</code> and <code>Secret - …</code> (currency lines are ignored). A store that already exists keeps its data and
          gets the new credentials. Secrets are encrypted before they&apos;re saved and the box clears after saving.
        </p>
        <BulkAddForm />
      </section>
    </div>
  );
}

async function StoreList() {
  const endpoint = `${await appOrigin()}/api/ingest/google-ads`;

  const stores = await sql<
    {
      id: number;
      name: string;
      shop_domain: string;
      shop_currency: string | null;
      ads_currency: string | null;
      ads_customer_id: string | null;
      timezone: string | null;
      ingest_key: string;
      products_synced_at: Date | null;
      orders_synced_at: Date | null;
      ads_synced_at: Date | null;
      last_sync_error: string | null;
      products: number;
    }[]
  >`
    select s.*, (select count(*)::int from products p where p.store_id = s.id) as products
    from stores s order by s.name`;

  if (stores.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No stores yet. Add one below.</p>;
  }

  return (
    <div className="space-y-4">
      {stores.map((s) => (
        <details key={s.id} className="group rounded-xl border border-slate-200 bg-white shadow-xs">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4">
            <span className="font-semibold">{s.name}</span>
            <span className="text-sm text-slate-500">{s.shop_domain}</span>
            <span className="text-sm text-slate-500">
              Shop {s.shop_currency ?? "?"} · Ads {s.ads_currency ?? "not connected"}
              {s.ads_customer_id && ` (${s.ads_customer_id})`}
            </span>
            <span className="ml-auto text-xs text-slate-500">
              Shopify {timeAgo(s.orders_synced_at)} · Google Ads {timeAgo(s.ads_synced_at)}
            </span>
            {s.last_sync_error && <span className="w-full text-sm text-red-600">Last sync error: {s.last_sync_error}</span>}
          </summary>
          <div className="space-y-5 border-t border-slate-100 px-5 py-5">
            <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
              <div>Products: {s.products.toLocaleString()}</div>
              <div>Timezone: {s.timezone ?? "unknown until first sync"}</div>
              <div>Display currency: {s.ads_currency ?? s.shop_currency ?? "–"}</div>
            </div>
            <StoreActions storeId={s.id} storeName={s.name} />
            <div>
              <h3 className="mb-1 text-sm font-semibold">Google Ads script for this store</h3>
              <p className="mb-3 text-sm text-slate-600">
                In the store&apos;s Google Ads account go to <strong>Tools → Bulk actions → Scripts</strong>, create a new script, paste this,
                authorize it, click <strong>Run</strong> once (the first run loads 35 days and can take 5–20 minutes), then set the frequency to{" "}
                <strong>Daily (3am)</strong> or <strong>Hourly</strong>. No editing is needed. Full steps are in the{" "}
                <Link href="/guide#part-3" className="font-medium text-violet-700 hover:underline">
                  setup guide
                </Link>
                . The key in this script is a password: don&apos;t share it.
              </p>
              <CopyBlock text={adsScript(endpoint, s.ingest_key)} />
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

const SOURCES = [
  { key: "invoice", label: "Supplier invoice", tone: "bg-emerald-500" },
  { key: "invoice_avg", label: "Avg. invoiced cost", tone: "bg-emerald-300" },
  { key: "sheet_estimate", label: "Profit-Sheet SKU cost", tone: "bg-sky-400" },
  { key: "shopify", label: "Shopify cost per item", tone: "bg-violet-400" },
  { key: "default", label: "Default %", tone: "bg-amber-400" },
  { key: "missing", label: "Missing", tone: "bg-red-300" },
] as const;

async function CogsSettings() {
  const stores = await sql<
    {
      id: number;
      name: string;
      default_cogs_pct: string | null;
      variants: number;
      with_cost: number;
      cogs_imported_at: Date | null;
      cogs_import_error: string | null;
      mix: Record<string, number> | null;
    }[]
  >`
    select s.id, s.name, s.default_cogs_pct::text, s.cogs_imported_at, s.cogs_import_error,
           (select count(*)::int from variants v where v.store_id = s.id) as variants,
           (select count(*)::int from variants v where v.store_id = s.id and v.unit_cost is not null) as with_cost,
           (select jsonb_object_agg(src, rev) from (
              select case when o.ext_cogs is not null then o.ext_cogs_source
                          when coalesce(p.cogs_override, v.unit_cost) is not null then 'shopify'
                          when s.default_cogs_pct is not null then 'default'
                          else 'missing' end as src,
                     sum(o.revenue_shop)::float as rev
              from order_lines o
              left join variants v on v.store_id = o.store_id and v.id = o.variant_id
              left join products p on p.store_id = o.store_id and p.id = o.product_id
              where o.store_id = s.id and not o.cancelled and o.day >= current_date - 30
              group by 1) m) as mix
    from stores s order by s.name`;
  if (stores.length === 0) return null;
  const connected = profitSheetConfigured();

  return (
    <section id="cogs" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <h2 className="mb-1 font-semibold">Cost of goods</h2>
      <p className="mb-4 text-sm text-slate-600">
        Each sale&apos;s cost comes from the first of these that exists: the <strong>supplier invoice</strong> matched in Profit-Sheet
        (products + shipping + other charges, split across the order&apos;s products), the product&apos;s{" "}
        <strong>average invoiced cost per unit</strong> for orders not invoiced yet, Profit-Sheet&apos;s <strong>SKU cost</strong>, Shopify&apos;s{" "}
        <strong>cost per item</strong>, then the store&apos;s <strong>default %</strong>. If none exists, net profit and POAS stay hidden.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <strong>Profit-Sheet:</strong>{" "}
          {connected ? (
            <span className="text-emerald-700">connected · costs import every hour</span>
          ) : (
            <span className="text-amber-700">not connected (PROFIT_SHEET_URL and PROFIT_SHEET_KEY aren&apos;t set)</span>
          )}
        </div>
        {connected && <ImportCogsButton />}
      </div>

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {stores.map((s) => {
          const coverage = s.variants ? Math.round((s.with_cost / s.variants) * 100) : 0;
          const mix = s.mix ?? {};
          const total = Object.values(mix).reduce((a, b) => a + b, 0);
          return (
            <div key={s.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="min-w-48 flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {connected &&
                      (s.cogs_import_error ? (
                        <span className="text-red-600">Profit-Sheet import failed: {s.cogs_import_error}</span>
                      ) : (
                        <>Profit-Sheet import: {timeAgo(s.cogs_imported_at)} · </>
                      ))}
                    Shopify cost per item on {s.with_cost.toLocaleString()} of {s.variants.toLocaleString()} variants ({coverage}%)
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">Default COGS</span>
                  <CogsForm storeId={s.id} value={s.default_cogs_pct === null ? "" : String(Number(s.default_cogs_pct))} />
                </div>
              </div>
              {total > 0 && (
                <div>
                  <div className="mb-1 text-xs text-slate-500">Where the cost comes from (share of revenue, last 30 days)</div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                    {SOURCES.map((src) =>
                      mix[src.key] ? (
                        <div key={src.key} className={src.tone} style={{ width: `${(mix[src.key] / total) * 100}%` }} title={src.label} />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {SOURCES.filter((src) => mix[src.key]).map((src) => (
                      <span key={src.key} className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${src.tone}`} />
                        {src.label} {Math.round((mix[src.key] / total) * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Example: a default of 35% counts a $50 sale as $17.50 cost of goods. Clear the field and save to remove it.
      </p>
    </section>
  );
}

async function TargetSettings() {
  const stores = await sql<{ id: number; name: string; niche: string | null; target_cogs_pct: string | null; target_roas: string }[]>`
    select id, name, niche, target_cogs_pct::text, target_roas::text from stores order by name`;
  if (stores.length === 0) return null;
  return (
    <section id="targets" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <h2 className="mb-1 font-semibold">Archive / improve targets</h2>
      <p className="mb-4 text-sm text-slate-600">
        Used by the <strong>Decision</strong> columns on the dashboard. Target CPA = price ÷ target ROAS; the archive threshold is 1.5×, 1.75×
        or 2× target CPA depending on price vs the store&apos;s AOV. The niche&apos;s target COGS sets the break-even ROAS and the
        “COGS above target” review check.
      </p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {stores.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div className="min-w-40 font-medium">{s.name}</div>
            <TargetsForm
              storeId={s.id}
              niche={s.niche ?? ""}
              cogs={s.target_cogs_pct === null ? "" : String(Number(s.target_cogs_pct))}
              roas={String(Number(s.target_roas))}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
