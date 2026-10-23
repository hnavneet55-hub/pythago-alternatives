import type { Totals } from "@/lib/report";
import { int, money, ratio } from "@/lib/format";

type BreakEven = { cogsPct: number | null; roas: number | null } | null;

export function SummaryCards({
  t,
  currency,
  label = "Products",
  breakEven = null,
}: {
  t: Totals;
  currency: string;
  label?: string;
  breakEven?: BreakEven;
}) {
  const noCogs = !t.cogsComplete;
  const cards = [
    { value: int(t.products), label },
    { value: money(t.cost, currency, 0), label: "Ad spend" },
    { value: int(t.qty), label: "Shopify units sold" },
    { value: money(t.revenue, currency, 0), label: "Shopify revenue" },
    { value: money(t.refunds, currency, 0), label: "Refunds", tone: t.refunds ? "text-red-600" : "" },
    { value: ratio(t.roas), label: "ROAS", sub: "Shopify revenue ÷ ad spend" },
    ...(breakEven
      ? [
          breakEven.roas === null
            ? { value: "–", label: "Break-even ROAS", sub: "Needs cost of goods (last 14 days)", tone: "text-slate-400" }
            : {
                value: ratio(breakEven.roas),
                label: "Break-even ROAS",
                sub: `Last 14 days · COGS ${breakEven.cogsPct!.toFixed(0)}% of revenue`,
                tone: t.roas !== null && t.roas < breakEven.roas ? "text-red-600" : "text-slate-900",
              },
        ]
      : []),
    noCogs
      ? {
          value: t.cogs > 0 ? `${money(t.cogs, currency, 0)}+` : "Not set",
          label: "Cost of goods",
          sub: `Missing for ${Math.round(t.cogsMissingShare * 100)}% of revenue`,
          tone: "text-amber-600",
        }
      : { value: money(t.cogs, currency, 0), label: "Cost of goods" },
    noCogs
      ? { value: "–", label: "Net profit", sub: "Needs cost of goods", tone: "text-slate-400" }
      : {
          value: money(t.netProfit, currency, 0),
          label: "Net profit",
          sub: "Revenue − refunds − COGS − ad spend",
          tone: (t.netProfit ?? 0) < 0 ? "text-red-600" : "text-emerald-600",
        },
    noCogs
      ? { value: "–", label: "POAS", sub: "Needs cost of goods", tone: "text-slate-400" }
      : { value: ratio(t.poas), label: "POAS", sub: "Net profit ÷ ad spend", tone: (t.poas ?? 0) < 0 ? "text-red-600" : "text-emerald-600" },
  ];
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 ${breakEven ? "2xl:grid-cols-10" : "2xl:grid-cols-9"}`}>
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-center shadow-xs">
          <div className={`text-xl font-semibold tabular-nums ${c.tone ?? ""}`}>{c.value}</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{c.label}</div>
          {c.sub && <div className="text-[10px] text-slate-400">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
