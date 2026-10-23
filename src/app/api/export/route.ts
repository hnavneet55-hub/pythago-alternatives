import { loadDashboard } from "@/lib/dashboard";

const COLUMNS = [
  ["store_name", "Store"], ["product_id", "Product ID"], ["title", "Product"], ["status", "Status"],
  ["variant_count", "Variants"], ["price", "Price"], ["cost", "Ad spend"], ["revenue", "Shopify revenue"],
  ["roas", "ROAS"], ["profit", "Net profit"], ["conversions", "Google conversions"],
  ["g_conv_value", "Google conversion value"], ["qty", "Units sold"], ["refund_qty", "Units refunded"],
  ["refunds", "Refunds"], ["cogs", "COGS"], ["clicks", "Clicks"], ["impressions", "Impressions"], ["ctr", "CTR"],
  ["cpc", "CPC"], ["cpa", "CPA"], ["roas7", "ROAS 7D"], ["cost7", "Spend 7D"], ["rev7", "Revenue 7D"],
  ["roas14", "ROAS 14D"], ["cost14", "Spend 14D"], ["rev14", "Revenue 14D"], ["roas30", "ROAS 30D"],
  ["cost30", "Spend 30D"], ["rev30", "Revenue 30D"], ["margin", "Margin per unit"], ["tags", "Tags"],
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
    ...rows.map((r) => COLUMNS.map(([key]) => cell((r as Record<string, unknown>)[key])).join(",")),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products_${scope.currency}_${params.from}_${params.to}.csv"`,
    },
  });
}
