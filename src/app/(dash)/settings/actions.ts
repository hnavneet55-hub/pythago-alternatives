"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";
import { encrypt, randomKey } from "@/lib/crypto";
import { syncFxRates } from "@/lib/fx";
import { importProfitSheetCogs } from "@/lib/profit-sheet";
import { syncOrders, syncProducts, type StoreRow } from "@/lib/shopify";

const StoreInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  shopDomain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((s) => s.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .transform((s) => (s.includes(".") ? s : `${s}.myshopify.com`))
    .refine((s) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s), "Use the store's .myshopify.com domain"),
  clientId: z.string().trim().optional(),
  clientSecret: z.string().trim().optional(),
  accessToken: z.string().trim().optional(),
});

export type ActionState = { ok?: string; error?: string } | null;

export async function addStore(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = StoreInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;
  if (!s.accessToken && !(s.clientId && s.clientSecret)) {
    return { error: "Enter the app's Client ID and Client secret (or an Admin API access token)" };
  }
  // Re-adding an existing domain updates its name and credentials and keeps its data and script key.
  const [row] = await sql<{ inserted: boolean }[]>`
    insert into stores (name, shop_domain, client_id, client_secret_enc, access_token_enc, ingest_key)
    values (${s.name}, ${s.shopDomain}, ${s.clientId || null},
            ${s.clientSecret ? encrypt(s.clientSecret) : null},
            ${s.accessToken ? encrypt(s.accessToken) : null}, ${randomKey()})
    on conflict (shop_domain) do update set
      name = excluded.name, client_id = excluded.client_id,
      client_secret_enc = excluded.client_secret_enc, access_token_enc = excluded.access_token_enc,
      last_sync_error = null
    returning (xmax = 0) as inserted`;
  refresh();
  return row.inserted
    ? { ok: `${s.name} added. Open it in the list above and press "Sync now".` }
    : { ok: `Credentials for ${s.name} updated (data and Google Ads script unchanged). Press "Sync now" to test them.` };
}

export async function syncStore(storeId: number): Promise<ActionState> {
  const [store] = await sql<StoreRow[]>`select * from stores where id = ${storeId}`;
  if (!store) return { error: "Store not found" };
  try {
    await syncFxRates().catch(() => 0);
    const products = await syncProducts(store);
    const orders = await syncOrders(store, Date.now() + 50_000);
    await sql`update stores set last_sync_error = null where id = ${storeId}`;
    refresh();
    return {
      ok: `Synced ${products} products and ${orders.count} orders${orders.done ? "" : " (more remaining, run again or wait for the hourly sync)"}`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`update stores set last_sync_error = ${message} where id = ${storeId}`;
    refresh();
    return { error: message };
  }
}

export async function removeStore(storeId: number) {
  await sql`delete from stores where id = ${storeId}`;
  refresh();
}

export async function rotateIngestKey(storeId: number) {
  await sql`update stores set ingest_key = ${randomKey()} where id = ${storeId}`;
  refresh();
}

export async function setDefaultCogs(_prev: ActionState, form: FormData): Promise<ActionState> {
  const storeId = Number(form.get("storeId"));
  const raw = String(form.get("pct") ?? "").trim().replace(",", ".").replace("%", "");
  if (raw === "") {
    await sql`update stores set default_cogs_pct = null where id = ${storeId}`;
    refresh();
    return { ok: "Default removed" };
  }
  const pct = Number(raw);
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return { error: "Enter a percentage between 0 and 99" };
  await sql`update stores set default_cogs_pct = ${pct} where id = ${storeId}`;
  refresh();
  return { ok: `Saved: ${pct}% of revenue` };
}

export async function importCogsNow(): Promise<ActionState> {
  const res = await importProfitSheetCogs();
  refresh();
  if ("skipped" in res) return { error: `Not connected: ${res.skipped}` };
  const errors = res.results.filter((r) => "error" in r && r.error);
  const done = res.results.filter((r) => "matched" in r);
  const summary = done.map((r) => `${r.store}: ${"matched" in r ? r.matched : 0} lines`).join(", ");
  if (errors.length) return { error: `${errors.map((r) => `${r.store}: ${"error" in r ? r.error : ""}`).join("; ")}${summary ? ` (ok: ${summary})` : ""}` };
  return { ok: summary ? `Imported. ${summary}` : "No matching stores in Profit-Sheet" };
}

export async function setTargets(_prev: ActionState, form: FormData): Promise<ActionState> {
  const storeId = Number(form.get("storeId"));
  const niche = String(form.get("niche") ?? "");
  const cogsRaw = String(form.get("cogs") ?? "").trim().replace(",", ".").replace("%", "");
  const roas = Number(String(form.get("roas") ?? "2.5").replace(",", "."));
  if (!Number.isFinite(roas) || roas <= 0 || roas > 20) return { error: "Target ROAS must be between 0 and 20" };
  const cogs = cogsRaw === "" ? null : Number(cogsRaw);
  if (cogs !== null && (!Number.isFinite(cogs) || cogs < 0 || cogs >= 100)) return { error: "Target COGS must be 0–99%" };
  await sql`update stores set niche = ${niche || null}, target_cogs_pct = ${cogs}, target_roas = ${roas} where id = ${storeId}`;
  refresh();
  return { ok: "Saved" };
}
