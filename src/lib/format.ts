const cache = new Map<string, Intl.NumberFormat>();

export function money(value: number | null | undefined, currency: string, digits = 2) {
  if (value === null || value === undefined) return "–";
  const key = `${currency}:${digits}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(key, f);
  }
  return f.format(value);
}

export const int = (v: number | null | undefined) => (v === null || v === undefined ? "–" : Math.round(v).toLocaleString("en-US"));
export const ratio = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(2));
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(2)}%`);

export function timeAgo(d: Date | null) {
  if (!d) return "never";
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Background class for a ROAS cell (break-even thresholds can be tuned here). */
export function roasTone(v: number | null) {
  if (v === null) return "";
  if (v >= 3) return "bg-emerald-100 text-emerald-900";
  if (v >= 2) return "bg-yellow-100 text-yellow-900";
  if (v >= 1) return "bg-orange-100 text-orange-900";
  return "bg-red-100 text-red-900";
}
