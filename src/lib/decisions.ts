// Product Archive / Improve decision framework (the team's "Product : Price Improvement" rules).
//
//   Target CPA        = selling price ÷ target ROAS (2.5 → 40% of price)
//   Actual CPA        = ad spend ÷ Shopify orders
//   Net ROAS          = (revenue − refunds) ÷ ad spend
//   Archive threshold = target CPA × multiplier, by price against the store's AOV:
//                       > 20% below AOV 1.5× · within ±20% 1.75× · > 20% above 2×
//   ARCHIVE    has sales and CPA ≥ threshold, or no sales and spend ≥ threshold
//   IMPROVE    has sales, target CPA < CPA < threshold
//   KEEP       has sales, CPA ≤ target CPA
//   TOO EARLY  no sales, spend below threshold
// Judgment calls are never decided silently: they're listed as "for review" reasons.

export const NICHES = [
  { name: "Fashion", cogs: 33, range: null },
  { name: "Home & Decor — lamps", cogs: 42.5, range: [40, 45] },
  { name: "Home & Decor — other", cogs: 38.5, range: [37, 40] },
  { name: "Gadgets", cogs: 33, range: null },
  { name: "Kids toys", cogs: 35, range: null },
] as const;

export type Decision = "ARCHIVE" | "IMPROVE" | "KEEP" | "TOO_EARLY";

export const DECISION_LABEL: Record<Decision, string> = {
  ARCHIVE: "Archive",
  IMPROVE: "Improve",
  KEEP: "Keep / scale",
  TOO_EARLY: "Too early",
};

export type DecisionInput = {
  price: number | null; // current Shopify selling price (display currency)
  cost: number; // ad spend
  orders: number;
  revenue: number;
  refunds: number;
  cogs: number;
  cogsKnown: boolean; // every sale has a cost basis
};

export type StoreTargets = {
  targetRoas: number;
  targetCogsPct: number | null; // niche target
  aov: number | null; // store average order value in the period
};

export type DecisionResult = {
  decision: Decision | null; // null when there's nothing to judge (no spend, no sales) or no price
  tier: "below" | "around" | "above" | null;
  multiplier: number | null;
  targetCpa: number | null;
  threshold: number | null;
  cpa: number | null;
  netRoas: number | null;
  cogsPct: number | null; // actual COGS % of revenue
  breakEvenRoas: number | null; // from the niche target COGS
  remaining: number | null; // TOO EARLY: spend left before the threshold
  review: string[];
};

export function decide(p: DecisionInput, t: StoreTargets): DecisionResult {
  const review: string[] = [];
  const netRevenue = p.revenue - p.refunds;
  const cpa = p.orders > 0 ? p.cost / p.orders : null;
  const netRoas = p.cost > 0 ? netRevenue / p.cost : null;
  const cogsPct = p.cogsKnown && p.revenue > 0 ? (p.cogs / p.revenue) * 100 : null;
  const breakEvenRoas = t.targetCogsPct !== null && t.targetCogsPct < 100 ? 1 / (1 - t.targetCogsPct / 100) : null;

  const base = { cpa, netRoas, cogsPct, breakEvenRoas };
  const empty: DecisionResult = { decision: null, tier: null, multiplier: null, targetCpa: null, threshold: null, remaining: null, review, ...base };

  if (p.cost <= 0 && p.orders === 0) return empty;
  if (p.price === null || p.price <= 0) {
    review.push("No selling price from Shopify: decision needs the current price");
    return empty;
  }

  const tier = t.aov === null || t.aov <= 0 ? "around" : p.price < t.aov * 0.8 ? "below" : p.price > t.aov * 1.2 ? "above" : "around";
  const multiplier = tier === "below" ? 1.5 : tier === "above" ? 2 : 1.75;
  const targetCpa = p.price / t.targetRoas;
  const threshold = targetCpa * multiplier;

  let decision: Decision;
  let remaining: number | null = null;
  if (p.orders > 0) {
    decision = cpa! >= threshold ? "ARCHIVE" : cpa! > targetCpa ? "IMPROVE" : "KEEP";
  } else if (p.cost >= threshold) {
    decision = "ARCHIVE";
  } else {
    decision = "TOO_EARLY";
    remaining = threshold - p.cost;
  }

  // Borderline: within 5% of the archive threshold either side.
  const measure = p.orders > 0 ? cpa! : p.cost;
  if (Math.abs(measure - threshold) <= threshold * 0.05) {
    review.push(`Within 5% of the archive threshold (${p.orders > 0 ? "CPA" : "spend"} ${measure.toFixed(2)} vs ${threshold.toFixed(2)})`);
  }
  if (p.orders > 0 && decision !== "ARCHIVE" && breakEvenRoas !== null && netRoas !== null && netRoas < breakEvenRoas) {
    review.push(`Below break-even ROAS (${netRoas.toFixed(2)} vs ${breakEvenRoas.toFixed(2)}) but CPA is under the archive threshold`);
  }
  if (cogsPct !== null && t.targetCogsPct !== null && cogsPct > t.targetCogsPct + 5) {
    review.push(`Actual COGS ${cogsPct.toFixed(0)}% is well above the ${t.targetCogsPct}% niche target`);
  }
  if (p.revenue > 0 && p.refunds >= p.revenue * 0.5) {
    review.push(`Refunds wipe out ${p.refunds >= p.revenue ? "all" : "most"} of the revenue`);
  }
  if (!p.cogsKnown && p.orders > 0) review.push("No cost of goods for some sales");

  return { decision, tier, multiplier, targetCpa, threshold, cpa, netRoas, cogsPct, breakEvenRoas, remaining, review };
}
