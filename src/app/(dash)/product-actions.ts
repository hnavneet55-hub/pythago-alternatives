"use server";

import { refresh } from "next/cache";
import { sql } from "@/lib/db";
import { PRODUCT_STATUSES, setProductStatus, type ProductStatus, type StoreRow } from "@/lib/shopify";

export type BulkStatusResult = { ok?: string; error?: string; failed?: { product: string; message: string }[] } | null;

/** Sets the status of the selected products ("storeId:productId" values) in Shopify. */
export async function bulkSetStatus(_prev: BulkStatusResult, form: FormData): Promise<BulkStatusResult> {
  const status = String(form.get("status") ?? "") as ProductStatus;
  if (!PRODUCT_STATUSES.includes(status)) return { error: "Choose a status" };
  const picks = form
    .getAll("sel")
    .map(String)
    .map((v) => v.split(":"))
    .filter(([s, p]) => /^\d+$/.test(s ?? "") && /^\d+$/.test(p ?? ""));
  if (picks.length === 0) return { error: "Select at least one product" };
  if (picks.length > 250) return { error: "Select at most 250 products at a time" };

  const storeIds = [...new Set(picks.map(([s]) => Number(s)))];
  const stores = new Map(
    (await sql<StoreRow[]>`select * from stores where id = any(${storeIds}::int[])`).map((s) => [s.id, s]),
  );
  const titles = new Map(
    (
      await sql<{ k: string; title: string }[]>`
        select store_id || ':' || id as k, title from products
        where (store_id, id) in (select * from unnest(${picks.map(([s]) => Number(s))}::int[], ${picks.map(([, p]) => p)}::bigint[]))`
    ).map((r) => [r.k, r.title]),
  );

  const failed: { product: string; message: string }[] = [];
  let done = 0;
  for (const [s, p] of picks) {
    const store = stores.get(Number(s));
    const name = titles.get(`${s}:${p}`) ?? `Product ${p}`;
    if (!store) {
      failed.push({ product: name, message: "Store not found" });
      continue;
    }
    try {
      await setProductStatus(store, p, status);
      done++;
    } catch (e) {
      failed.push({ product: name, message: e instanceof Error ? e.message : String(e) });
      // Same cause for every product (missing scope, bad credentials): stop early.
      if (/write_products|credentials|Client ID|denied access/i.test(failed.at(-1)!.message)) break;
    }
  }
  refresh();
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  if (failed.length === 0) return { ok: `${done} ${done === 1 ? "product" : "products"} set to ${label} in Shopify` };
  return { error: `${done} updated, ${failed.length} failed`, failed };
}
