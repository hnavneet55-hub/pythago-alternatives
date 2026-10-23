import Link from "next/link";
import { BULK_FORM_ID, SelectAllCheckbox } from "@/components/bulk-status-bar";
import { CopyId } from "@/components/copy-id";
import type { DashboardRow } from "@/lib/dashboard";
import { int, money, pct, ratio, roasTone } from "@/lib/format";
import { DECISION_LABEL, type Decision } from "@/lib/decisions";

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
  {
    key: "profit", label: "Net profit", title: "Revenue − refunds − COGS − ad spend",
    render: (r, c) =>
      r.profit === null ? (
        <span className="text-[12px] font-medium text-amber-600" title="Some sales have no cost of goods. Set a cost in Shopify or a default % for the store.">
          Needs COGS
        </span>
      ) : (
        <span className={r.profit < 0 ? "text-red-600" : "text-emerald-700"}>{money(r.profit, c)}</span>
      ),
  },
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
  {
    key: "cogs", label: "COGS", title: "Cost of goods: product override, else Shopify cost per item, else the store's default %",
    render: (r, c) => (r.rev_no_cogs > 0.005 ? <span className="text-amber-600">{r.cogs > 0 ? `${money(r.cogs, c)}+` : "Not set"}</span> : money(r.cogs, c)),
  },
  { key: "clicks", label: "Clicks", render: (r) => <span className="text-violet-700">{int(r.clicks)}</span> },
  { key: "ctr", label: "CTR", render: (r) => <span className="text-emerald-700">{pct(r.ctr)}</span> },
  { key: "cpc", label: "CPC", render: (r, c) => money(r.cpc, c) },
  { key: "orders", label: "Orders", title: "Shopify orders containing the product", render: (r) => int(r.orders) },
  { key: "cpa", label: "CPA", title: "Ad spend ÷ Shopify orders", render: (r, c) => money(r.cpa, c) },
  ...(["7", "14", "30"] as const).flatMap((n): Column[] => [
    { key: `roas${n}`, label: "ROAS", group: `${n}D` as Column["group"], render: (r) => ratio(r[`roas${n}`]), className: (r) => roasTone(r[`roas${n}`]) },
    { key: `cost${n}`, label: "Spend", group: `${n}D` as Column["group"], render: (r, c) => money(r[`cost${n}`], c) },
    { key: `rev${n}`, label: "Revenue", group: `${n}D` as Column["group"], render: (r, c) => money(r[`rev${n}`], c) },
    { key: `imp${n}`, label: "Impr.", group: `${n}D` as Column["group"], render: (r) => int(r[`imp${n}`]) },
  ]),
  { key: "margin", label: "Margin / unit", title: "Price − cost per item", render: (r, c) => money(r.margin, c) },
];

// Light background per column section, so sections are easy to tell apart when scanning across.
// Solid shades: the header row is sticky, so see-through tints would show rows scrolling under it.
const TINT = {
  decision: "bg-violet-50",
  "7D": "bg-amber-50",
  "14D": "bg-emerald-50",
  "30D": "bg-indigo-50",
  halo: "bg-sky-50",
} as const;
// A cell keeps its own colour (ROAS tones); otherwise it gets the section tint.
const cellBg = (tone: string | undefined, tint: string) => (tone ? tone : tint);

const DECISION_TONE: Record<Decision, string> = {
  ARCHIVE: "bg-red-100 text-red-800 ring-red-200",
  IMPROVE: "bg-amber-100 text-amber-800 ring-amber-200",
  KEEP: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  TOO_EARLY: "bg-slate-100 text-slate-600 ring-slate-200",
};
const TIER_LABEL = { below: "below AOV", around: "≈ AOV", above: "above AOV" } as const;

// Archive / improve framework columns (product rows only).
const DECISION_COLUMNS: Column[] = [
  {
    key: "decision", label: "Decision", title: "Archive / improve framework: see Setup guide → Decisions",
    render: (r) => {
      const d = r.d;
      if (!d) return "–";
      return (
        <div className="flex items-center justify-end gap-1.5">
          {d.decision ? (
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${DECISION_TONE[d.decision]}`}>
              {DECISION_LABEL[d.decision]}
            </span>
          ) : (
            <span className="text-slate-400">–</span>
          )}
          {d.review.length > 0 && (
            <span
              className="cursor-help rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-200"
              title={`For human review:\n• ${d.review.join("\n• ")}`}
            >
              Review
            </span>
          )}
        </div>
      );
    },
  },
  { key: "target_cpa", label: "Target CPA", title: "Selling price ÷ target ROAS", render: (r, c) => money(r.target_cpa, c) },
  {
    key: "threshold", label: "Archive at", title: "Archive threshold CPA = target CPA × multiplier (1.5× / 1.75× / 2× by price vs store AOV)",
    render: (r, c) =>
      r.d?.threshold == null ? (
        "–"
      ) : (
        <>
          {money(r.d.threshold, c)}
          <div className="text-[10px] text-slate-500">
            {r.d.multiplier}× · {TIER_LABEL[r.d.tier!]}
            {r.d.remaining != null && ` · ${money(r.d.remaining, c, 0)} left`}
          </div>
        </>
      ),
  },
  {
    key: "net_roas", label: "Net ROAS", title: "(Revenue − refunds) ÷ ad spend",
    render: (r) => ratio(r.net_roas), className: (r) => roasTone(r.net_roas),
  },
  {
    key: "cogs_pct", label: "COGS %", title: "Actual cost of goods as % of revenue (niche target and break-even ROAS below)",
    render: (r) =>
      r.d?.cogsPct == null ? (
        "–"
      ) : (
        <>
          {r.d.cogsPct.toFixed(0)}%
          {r.d.breakEvenRoas != null && <div className="text-[10px] text-slate-500">BE ROAS {r.d.breakEvenRoas.toFixed(2)}</div>}
        </>
      ),
  },
];

// Halo (product rows only): sales of OTHER products from customers who landed on this product's page.
// They're shown only here; the other products' own columns are unchanged.
const HALO_COLUMNS: Column[] = [
  { key: "halo", label: "Halo rev.", title: "Revenue of other products in orders whose customer landed on this product (selected dates)", render: (r, c) => money(r.halo, c) },
  { key: "halo_orders", label: "Halo orders", title: "Orders that landed on this product but bought other products", render: (r) => int(r.halo_orders) },
  {
    key: "roas_halo", label: "ROAS + halo", title: "(This product's revenue + halo revenue) ÷ ad spend",
    render: (r) => ratio(r.roas_halo), className: (r) => roasTone(r.roas_halo),
  },
  { key: "halo7", label: "7D", title: "Halo revenue, last 7 days", render: (r, c) => money(r.halo7, c) },
  { key: "halo14", label: "14D", title: "Halo revenue, last 14 days", render: (r, c) => money(r.halo14, c) },
  { key: "halo30", label: "30D", title: "Halo revenue, last 30 days", render: (r, c) => money(r.halo30, c) },
];

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200",
  ARCHIVED: "bg-amber-50 text-amber-700 ring-amber-200",
  DELETED: "bg-red-50 text-red-700 ring-red-200",
  UNLISTED: "bg-sky-50 text-sky-700 ring-sky-200",
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
  selectable = false,
  haloNote,
}: {
  rows: DashboardRow[];
  currency: string;
  mode: Mode;
  showStore: boolean;
  sort: string;
  dir: "asc" | "desc";
  sortHref: (key: string, dir: "asc" | "desc") => string;
  productHref?: (r: DashboardRow) => string;
  selectable?: boolean; // product checkboxes for the bulk status bar
  haloNote?: string;
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
    <div className="max-h-[75vh] overflow-auto rounded-b-xl bg-white">
      <table className="w-full border-separate border-spacing-0 text-right text-[13px] tabular-nums">
        <thead className="sticky top-0 z-20 bg-white text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="sticky left-0 z-30 bg-white" colSpan={1} />
            <th colSpan={(showStore ? 1 : 0) + (mode === "product" ? 2 : 1)} />
            {mode === "product" && (
              <th colSpan={DECISION_COLUMNS.length} className={`${TINT.decision} px-3 pt-2 text-center font-semibold text-violet-800`}>
                Archive / improve
              </th>
            )}
            <th colSpan={15} />
            {(["7D", "14D", "30D"] as const).map((g) => (
              <th key={g} colSpan={4} className={`border-l border-slate-200 ${TINT[g]} px-3 pt-2 text-center font-semibold text-slate-700`}>
                Last {g.replace("D", " days")}
              </th>
            ))}
            <th />
            {mode === "product" && (
              <th colSpan={HALO_COLUMNS.length} className={`border-l border-slate-200 ${TINT.halo} px-3 pt-2 text-center font-semibold text-sky-800`} title={haloNote}>
                Halo (landed here, bought other products)
              </th>
            )}
          </tr>
          <tr className="[&>th]:border-b [&>th]:border-slate-200">
            {selectable ? (
              <th className="sticky left-0 z-30 min-w-72 whitespace-nowrap bg-white px-3 py-2 text-left font-medium">
                <div className="flex items-center gap-3">
                  <SelectAllCheckbox />
                  <Link href={sortHref("title", sort === "title" && dir === "desc" ? "asc" : "desc")} scroll={false} className="hover:text-violet-700">
                    Product {sort === "title" && (dir === "desc" ? "↓" : "↑")}
                  </Link>
                </div>
              </th>
            ) : (
              head("title", mode === "product" ? "Product" : "Variant / SKU", undefined, "sticky left-0 z-30 bg-white text-left min-w-72")
            )}
            {showStore && head("store_name", "Store", undefined, "text-left")}
            {mode === "product" && head("status", "Status", undefined, "text-left")}
            {mode === "product" ? head("variant_count", "Variants") : head("unit_cost", "Unit cost")}
            {mode === "product" && DECISION_COLUMNS.map((c) => head(c.key, c.label, c.title, TINT.decision))}
            {COLUMNS.map((c) =>
              head(c.key, c.label, c.title, `${c.group ? TINT[c.group] : ""} ${c.group && c.key.startsWith("roas") ? "border-l border-slate-200" : ""}`),
            )}
            {mode === "product" &&
              HALO_COLUMNS.map((c, i) => head(c.key, c.label, c.title, `${TINT.halo} ${i === 0 ? "border-l border-slate-200" : ""}`))}
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
                  {selectable && (
                    <input
                      type="checkbox"
                      name="sel"
                      value={`${r.store_id}:${r.product_id}`}
                      form={BULK_FORM_ID}
                      aria-label={`Select ${r.title}`}
                      className="h-4 w-4 shrink-0 accent-violet-600"
                    />
                  )}
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
                      {mode === "product" ? (
                        <>
                          ID: {r.product_id}
                          <CopyId value={r.product_id} />
                        </>
                      ) : (
                        <>
                          SKU: {r.sku ?? "–"}
                          {r.sku && <CopyId value={r.sku} label="SKU" />} · ID: {r.key_id}
                          <CopyId value={r.key_id} label="variant ID" />
                        </>
                      )}
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
              {mode === "product" &&
                DECISION_COLUMNS.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${cellBg(c.className?.(r), TINT.decision)}`}>
                    {c.render(r, currency)}
                  </td>
                ))}
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-2 ${c.group ? cellBg(c.className?.(r), TINT[c.group]) : (c.className?.(r) ?? "")} ${c.group && c.key.startsWith("roas") ? "border-l border-slate-200 font-medium" : ""}`}
                >
                  {c.render(r, currency)}
                </td>
              ))}
              {mode === "product" &&
                HALO_COLUMNS.map((c, i) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-2 ${cellBg(c.className?.(r), TINT.halo)} ${i === 0 ? "border-l border-slate-200" : ""}`}
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
