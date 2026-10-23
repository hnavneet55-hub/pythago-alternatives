import Link from "next/link";
import type { DashboardRow } from "@/lib/dashboard";
import { int, money, pct, ratio, roasTone } from "@/lib/format";

type Mode = "product" | "variant";

type Column = {
  key: string;
  label: string;
  title?: string;
  group?: "7D" | "14D" | "30D";
  render: (r: DashboardRow, cur: string) => React.ReactNode;
  className?: (r: DashboardRow) => string;
};

const COLUMNS: Column[] = [
  { key: "price", label: "Price", render: (r, c) => money(r.price, c) },
  { key: "cost", label: "Ad spend", title: "Google Ads cost", render: (r, c) => money(r.cost, c) },
  { key: "revenue", label: "Revenue", title: "Shopify revenue after discounts", render: (r, c) => money(r.revenue, c) },
  { key: "roas", label: "ROAS", title: "Shopify revenue ÷ ad spend", render: (r) => ratio(r.roas), className: (r) => roasTone(r.roas) },
  { key: "profit", label: "Net profit", title: "Revenue − refunds − COGS − ad spend",
    render: (r, c) => <span className={r.profit < 0 ? "text-red-600" : "text-emerald-700"}>{money(r.profit, c)}</span> },
  { key: "conversions", label: "Conv.", title: "Conversions measured by Google Ads", render: (r) => <span className="text-violet-700">{ratio(r.conversions).replace(/\.00$/, "")}</span> },
  { key: "g_conv_value", label: "Conv. value", title: "Conversion value measured by Google Ads", render: (r, c) => money(r.g_conv_value, c) },
  {
    key: "qty", label: "Qty", title: "Units sold in Shopify (refunded units in red)",
    render: (r) => (
      <>
        {int(r.qty)}
        {r.refund_qty > 0 && <div className="text-[11px] text-red-500">(−{r.refund_qty})</div>}
      </>
    ),
  },
  { key: "refunds", label: "Refunds", render: (r, c) => (r.refunds ? <span className="text-red-600">−{money(r.refunds, c)}</span> : "–") },
  { key: "cogs", label: "COGS", title: "Cost of goods sold (Shopify cost per item)", render: (r, c) => money(r.cogs, c) },
  { key: "clicks", label: "Clicks", render: (r) => <span className="text-violet-700">{int(r.clicks)}</span> },
  { key: "ctr", label: "CTR", render: (r) => <span className="text-emerald-700">{pct(r.ctr)}</span> },
  { key: "cpc", label: "CPC", render: (r, c) => money(r.cpc, c) },
  { key: "cpa", label: "CPA", title: "Ad spend ÷ Google Ads conversions", render: (r, c) => money(r.cpa, c) },
  ...(["7", "14", "30"] as const).flatMap((n): Column[] => [
    { key: `roas${n}`, label: "ROAS", group: `${n}D` as Column["group"], render: (r) => ratio(r[`roas${n}`]), className: (r) => roasTone(r[`roas${n}`]) },
    { key: `cost${n}`, label: "Spend", group: `${n}D` as Column["group"], render: (r, c) => money(r[`cost${n}`], c) },
    { key: `rev${n}`, label: "Revenue", group: `${n}D` as Column["group"], render: (r, c) => money(r[`rev${n}`], c) },
    { key: `imp${n}`, label: "Impr.", group: `${n}D` as Column["group"], render: (r) => int(r[`imp${n}`]) },
  ]),
  { key: "margin", label: "Margin / unit", title: "Price − cost per item", render: (r, c) => money(r.margin, c) },
];

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200",
  ARCHIVED: "bg-amber-50 text-amber-700 ring-amber-200",
  DELETED: "bg-red-50 text-red-700 ring-red-200",
};

export function MetricsTable({
  rows,
  currency,
  mode,
  showStore,
  sort,
  dir,
  sortHref,
  productHref,
}: {
  rows: DashboardRow[];
  currency: string;
  mode: Mode;
  showStore: boolean;
  sort: string;
  dir: "asc" | "desc";
  sortHref: (key: string, dir: "asc" | "desc") => string;
  productHref?: (r: DashboardRow) => string;
}) {
  const head = (key: string, label: string, title?: string, extra = "") => {
    const active = sort === key;
    const nextDir = active && dir === "desc" ? "asc" : "desc";
    return (
      <th key={key} title={title} className={`whitespace-nowrap px-3 py-2 font-medium ${active ? "bg-violet-50 text-violet-700" : ""} ${extra}`}>
        <Link href={sortHref(key, nextDir)} scroll={false} className="inline-flex items-center gap-1 hover:text-violet-700">
          {label}
          {active && <span aria-hidden>{dir === "desc" ? "↓" : "↑"}</span>}
        </Link>
      </th>
    );
  };

  return (
    <div className="max-h-[75vh] overflow-auto rounded-b-xl">
      <table className="w-full border-separate border-spacing-0 text-right text-[13px] tabular-nums">
        <thead className="sticky top-0 z-20 bg-white text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="sticky left-0 z-30 bg-white" colSpan={1} />
            <th colSpan={(showStore ? 1 : 0) + (mode === "product" ? 2 : 1) + 14} />
            {(["7D", "14D", "30D"] as const).map((g) => (
              <th key={g} colSpan={4} className="border-l border-slate-200 px-3 pt-2 text-center font-semibold text-slate-700">
                Last {g.replace("D", " days")}
              </th>
            ))}
            <th />
          </tr>
          <tr className="[&>th]:border-b [&>th]:border-slate-200">
            {head("title", mode === "product" ? "Product" : "Variant / SKU", undefined, "sticky left-0 z-30 bg-white text-left min-w-72")}
            {showStore && head("store_name", "Store", undefined, "text-left")}
            {mode === "product" && head("status", "Status", undefined, "text-left")}
            {mode === "product" ? head("variant_count", "Variants") : head("unit_cost", "Unit cost")}
            {COLUMNS.map((c) => head(c.key, c.label, c.title, c.group && c.key.startsWith("roas") ? "border-l border-slate-200" : ""))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={40} className="px-4 py-16 text-center text-slate-500">
                No data for this selection.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.store_id}:${r.key_id}`} className="group [&>td]:border-b [&>td]:border-slate-100 hover:[&>td]:bg-slate-50">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left">
                <div className="flex items-center gap-3">
                  {mode === "product" &&
                    (r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${r.image_url}${r.image_url.includes("?") ? "&" : "?"}width=96`} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover ring-1 ring-slate-200" />
                    ) : (
                      <div className="h-11 w-11 shrink-0 rounded-md bg-slate-100 ring-1 ring-slate-200" />
                    ))}
                  <div className="min-w-0">
                    {mode === "product" && productHref ? (
                      <Link href={productHref(r)} className="block max-w-64 truncate font-medium text-slate-900 hover:text-violet-700" title={r.title}>
                        {r.title}
                      </Link>
                    ) : (
                      <div className="max-w-64 truncate font-medium">{mode === "product" ? r.title : r.variant_title}</div>
                    )}
                    <div className="text-[11px] text-slate-500">
                      {mode === "product" ? `ID: ${r.product_id}` : `SKU: ${r.sku ?? "–"} · ID: ${r.key_id}`}
                      {mode === "product" && r.tags.length > 0 && <span className="ml-2 text-violet-600">{r.tags.slice(0, 3).join(", ")}</span>}
                    </div>
                  </div>
                </div>
              </td>
              {showStore && <td className="whitespace-nowrap px-3 py-2 text-left text-slate-600">{r.store_name}</td>}
              {mode === "product" && (
                <td className="px-3 py-2 text-left">
                  {r.status && (
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ${STATUS_TONE[r.status] ?? ""}`}>
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </span>
                  )}
                </td>
              )}
              <td className="px-3 py-2">
                {mode === "product" ? (
                  productHref ? (
                    <Link href={productHref(r)} className="rounded bg-violet-50 px-1.5 py-0.5 text-[12px] font-medium text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100">
                      {r.variant_count}
                    </Link>
                  ) : (
                    r.variant_count
                  )
                ) : (
                  money(r.unit_cost, currency)
                )}
              </td>
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-2 ${c.className?.(r) ?? ""} ${c.group && c.key.startsWith("roas") ? "border-l border-slate-200 font-medium" : ""}`}
                >
                  {c.render(r, currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
