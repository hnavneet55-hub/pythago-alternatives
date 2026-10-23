import { sql } from "./db";

// ECB reference rates via frankfurter.dev (free, no key). Rates are EUR-based.
export async function syncFxRates() {
  const [{ last }] = await sql<{ last: string | null }[]>`select max(day)::text as last from fx_rates`;
  const from = last ?? "2025-01-01";
  const today = new Date().toISOString().slice(0, 10);
  if (last === today) return 0;

  const res = await fetch(`https://api.frankfurter.dev/v1/${from}..${today}?base=EUR`);
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const body = (await res.json()) as { rates: Record<string, Record<string, number>> };

  const rows = Object.entries(body.rates).flatMap(([day, rates]) =>
    Object.entries(rates).map(([currency, per_eur]) => ({ day, currency, per_eur })),
  );
  for (let i = 0; i < rows.length; i += 1000) {
    await sql`
      insert into fx_rates ${sql(rows.slice(i, i + 1000), "day", "currency", "per_eur")}
      on conflict (currency, day) do update set per_eur = excluded.per_eur`;
  }
  return rows.length;
}
