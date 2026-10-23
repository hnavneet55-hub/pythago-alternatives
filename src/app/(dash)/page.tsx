import { Suspense } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { MetricsTable } from "@/components/metrics-table";
import { SummaryCards } from "@/components/summary-cards";
import { getCountries, hrefWith, loadDashboard, type SearchParams } from "@/lib/dashboard";
import { timeAgo } from "@/lib/format";

const PAGE_SIZE = 50;

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<div className="py-24 text-center text-slate-500">Loading dashboard…</div>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { params, stores, scope, rows, totals, allTags, lastSync } = await loadDashboard(sp);
  const countries = await getCountries(scope.storeIds);

  if (stores.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold">No stores connected yet</h1>
        <p className="mt-2 text-sm text-slate-500">Connect your first Shopify store and Google Ads account to see product profit.</p>
        <Link href="/settings" className="mt-6 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
          Connect a store
        </Link>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(params.page, pages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const exportHref = hrefWith("/api/export", sp, { page: null });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-500">Product performance from Google Ads and Shopify · {scope.label}</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <FilterBar stores={stores} countries={countries} tags={allTags} />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
          <span>
            Performance data · {params.from} to {params.to} · values in <strong className="text-slate-700">{scope.currency}</strong>
          </span>
          <span className="ml-auto">Last Google Ads sync: {timeAgo(lastSync)}</span>
          <a href={exportHref} className="rounded-md border border-violet-300 px-3 py-1.5 font-medium text-violet-700 hover:bg-violet-50">
            Export CSV
          </a>
        </div>
      </section>

      <SummaryCards t={totals} currency={scope.currency} />

      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="font-semibold">Product performance</h2>
            <p className="text-sm text-slate-500">
              Showing {pageRows.length} of {rows.length} products · all SKUs of a product are combined
            </p>
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              {page > 1 && (
                <Link className="rounded-md border px-2.5 py-1 hover:bg-slate-50" href={hrefWith("/", sp, { page: String(page - 1) })}>
                  ← Prev
                </Link>
              )}
              <span className="text-slate-500">
                Page {page} of {pages}
              </span>
              {page < pages && (
                <Link className="rounded-md border px-2.5 py-1 hover:bg-slate-50" href={hrefWith("/", sp, { page: String(page + 1) })}>
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
        <MetricsTable
          rows={pageRows}
          currency={scope.currency}
          mode="product"
          showStore={scope.storeIds.length > 1}
          sort={params.sort}
          dir={params.dir}
          sortHref={(key, dir) => hrefWith("/", sp, { sort: key, dir, page: null })}
          productHref={(r) => hrefWith(`/products/${r.store_id}/${r.product_id}`, sp, { page: null, q: null, sort: null, dir: null, status: null, tag: null })}
        />
      </section>
    </div>
  );
}
