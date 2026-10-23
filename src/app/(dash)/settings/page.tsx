import { Suspense } from "react";
import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { adsScript } from "@/lib/ads-script";
import { timeAgo } from "@/lib/format";
import { AddStoreForm, CopyBlock, StoreActions } from "./forms";

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
      <Suspense fallback={<div className="text-slate-500">Loading stores…</div>}>
        <StoreList />
      </Suspense>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="mb-1 font-semibold">Connect a Shopify store</h2>
        <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>
            In the Shopify <strong>Dev Dashboard</strong> (dev.shopify.com), create an app in the same organization as your stores.
          </li>
          <li>
            Create a version with scopes <code className="rounded bg-slate-100 px-1">read_products</code>,{" "}
            <code className="rounded bg-slate-100 px-1">read_orders</code>,{" "}
            <code className="rounded bg-slate-100 px-1">read_all_orders</code>,{" "}
            <code className="rounded bg-slate-100 px-1">read_inventory</code>, then release it and install it on the store.
          </li>
          <li>Copy the app&apos;s Client ID and Client secret from its settings page into the form below.</li>
        </ol>
        <AddStoreForm />
      </section>
    </div>
  );
}

async function StoreList() {
  const h = await headers();
  const origin =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`);
  const endpoint = `${origin}/api/ingest/google-ads`;

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
                authorize it, and set the frequency to <strong>Hourly</strong>. For the first run change <code>DAYS_BACK</code> to 90 to import
                history. The key in this script is a password: don&apos;t share it.
              </p>
              <CopyBlock text={adsScript(endpoint, s.ingest_key)} />
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
