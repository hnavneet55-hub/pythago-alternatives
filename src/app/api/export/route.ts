import { loadDashboard } from "@/lib/dashboard";
import { DECISION_LABEL } from "@/lib/decisions";

const COLUMNS = [
  ["store_name", "Store"], ["product_id", "Product ID"], ["title", "Product"], ["status", "Status"],
  ["variant_count", "Variants"], ["decision_label", "Decision"], ["review", "For human review"],
  ["target_cpa", "Target CPA"], ["threshold", "Archive threshold CPA"], ["multiplier", "Threshold multiplier"],
  ["tier", "Price vs AOV"], ["net_roas", "Net ROAS"], ["cogs_pct", "COGS %"], ["break_even_roas", "Break-even ROAS"],
  ["price", "Price"], ["cost", "Ad spend"], ["revenue", "Shopify revenue"],
  ["roas", "ROAS"], ["profit", "Net profit"], ["conversions", "Google conversions"],
  ["g_conv_value", "Google conversion value"], ["orders", "Shopify orders"], ["qty", "Units sold"], ["refund_qty", "Units refunded"],
  ["refunds", "Refunds"], ["cogs", "COGS"], ["clicks", "Clicks"], ["impressions", "Impressions"], ["ctr", "CTR"],
  ["cpc", "CPC"], ["cpa", "CPA (spend ÷ orders)"], ["roas7", "ROAS 7D"], ["cost7", "Spend 7D"], ["rev7", "Revenue 7D"],
  ["roas14", "ROAS 14D"], ["cost14", "Spend 14D"], ["rev14", "Revenue 14D"], ["roas30", "ROAS 30D"],
  ["cost30", "Spend 30D"], ["rev30", "Revenue 30D"], ["margin", "Margin per unit"], ["halo", "Halo revenue"], ["halo_orders", "Halo orders"], ["roas_halo", "ROAS incl. halo"],
  ["halo7", "Halo revenue 7D"], ["halo14", "Halo revenue 14D"], ["halo30", "Halo revenue 30D"], ["tags", "Tags"],
] as const;

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(Math.round(v * 10000) / 10000);
  const s = Array.isArray(v) ? v.join("|") : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function GET(request: Request) {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const { params, rows, scope } = await loadDashboard(sp);
  const lines = [
    COLUMNS.map(([, label]) => label).join(","),
    ...rows.map((r) => {
      const extra: Record<string, unknown> = {
        decision_label: r.d?.decision ? DECISION_LABEL[r.d.decision] : null,
        review: r.d?.review.join(" | ") || null,
        multiplier: r.d?.multiplier,
        tier: r.d?.tier,
        break_even_roas: r.d?.breakEvenRoas,
      };
      const values = { ...r, ...extra } as Record<string, unknown>;
      return COLUMNS.map(([key]) => cell(values[key])).join(",");
    }),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products_${scope.currency}_${params.from}_${params.to}.csv"`,
    },
  });
}
