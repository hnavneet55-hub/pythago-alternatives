"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";
import { encrypt, randomKey } from "@/lib/crypto";
import { syncFxRates } from "@/lib/fx";
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
  try {
    await sql`
      insert into stores (name, shop_domain, client_id, client_secret_enc, access_token_enc, ingest_key)
      values (${s.name}, ${s.shopDomain}, ${s.clientId || null},
              ${s.clientSecret ? encrypt(s.clientSecret) : null},
              ${s.accessToken ? encrypt(s.accessToken) : null}, ${randomKey()})`;
  } catch (e) {
    if (e instanceof Error && e.message.includes("duplicate")) return { error: "That store is already connected" };
    throw e;
  }
  refresh();
  return { ok: `${s.name} added. Run "Sync now" to import products and orders.` };
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
