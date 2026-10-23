import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FilterBar } from "@/components/filter-bar";
import { MetricsTable } from "@/components/metrics-table";
import { SummaryCards } from "@/components/summary-cards";
import { derive, getCountries, getStoreSummaries, hrefWith, parseParams, resolveScope, sortRows } from "@/lib/dashboard";
import { sql } from "@/lib/db";
import { getReport, totals } from "@/lib/report";

export default function ProductPage(props: PageProps<"/products/[storeId]/[productId]">) {
  return (
    <Suspense fallback={<div className="py-24 text-center text-slate-500">Loading product…</div>}>
      <Product {...props} />
    </Suspense>
  );
}

async function Product({ params, searchParams }: PageProps<"/products/[storeId]/[productId]">) {
  const { storeId, productId } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(storeId) || !/^\d+$/.test(productId)) notFound();

  await connection(); // date defaults depend on the current time
  const p = parseParams(sp);
  const stores = await getStoreSummaries();
  const store = stores.find((s) => String(s.id) === storeId);
  if (!store) notFound();
  const scope = resolveScope(stores, [store.id]);

  const [product] = await sql<{ title: string; status: string; handle: string | null; image_url: string | null }[]>`
    select title, status, handle, image_url from products where store_id = ${store.id} and id = ${productId}::bigint`;

  const report = await getReport(
    { storeIds: [store.id], currency: scope.currency, from: p.from, to: p.to, country: p.country, productId },
    "variant",
  );
  const rows = sortRows(
    report.map((r) => derive(r, store.name)),
    p.sort,
    p.dir,
  );
  const countries = await getCountries([store.id]);
  const path = `/products/${storeId}/${productId}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Link href={hrefWith("/", sp, { sort: null, dir: null })} className="text-sm text-violet-700 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
      <div className="flex items-center gap-4">
        {product?.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${product.image_url}${product.image_url.includes("?") ? "&" : "?"}width=160`} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{product?.title ?? `Product ${productId}`}</h1>
          <p className="text-sm text-slate-500">
            {store.name} · ID {productId} · {product?.status ?? "unknown status"} · per-SKU breakdown in {scope.currency}
          </p>
        </div>
        <a
          href={`https://${store.shop_domain}/admin/products/${productId}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Open in Shopify ↗
        </a>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <FilterBar countries={countries} tags={[]} showProductFilters={false} />
      </section>

      <SummaryCards t={totals(rows)} currency={scope.currency} label="SKUs with activity" />

      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="px-4 py-3">
          <h2 className="font-semibold">SKU performance</h2>
          <p className="text-sm text-slate-500">{rows.length} variants with ad spend or sales in this period</p>
        </div>
        <MetricsTable
          rows={rows}
          currency={scope.currency}
          mode="variant"
          showStore={false}
          sort={p.sort}
          dir={p.dir}
          sortHref={(key, dir) => hrefWith(path, sp, { sort: key, dir })}
        />
      </section>
    </div>
  );
}
