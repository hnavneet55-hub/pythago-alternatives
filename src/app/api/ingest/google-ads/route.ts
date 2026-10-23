import { z } from "zod";
import { sql } from "@/lib/db";
import { parseItemId } from "@/lib/item-id";

// Receives product-level Performance Max / Shopping stats from the Google Ads script.
const Body = z.object({
  customerId: z.string(),
  currency: z.string().length(3),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        itemId: z.string().min(1),
        campaignId: z.coerce.string(),
        campaignName: z.string().optional(),
        impressions: z.coerce.number(),
        clicks: z.coerce.number(),
        costMicros: z.coerce.number(),
        conversions: z.coerce.number(),
        conversionsValue: z.coerce.number(),
      }),
    )
    .max(10000), // the script sends batches of 5000 (~1 MB, well under the 4.5 MB body limit)
});

async function storeForKey(request: Request) {
  const key = request.headers.get("x-ingest-key");
  if (!key) return null;
  const [store] = await sql<{ id: number }[]>`select id from stores where ingest_key = ${key}`;
  return store ?? null;
}

// The script asks for the last day it delivered, to decide between a quick or a full refresh.
export async function GET(request: Request) {
  const store = await storeForKey(request);
  if (!store) return Response.json({ error: "invalid key" }, { status: 401 });
  const [row] = await sql<{ last_day: string | null }[]>`
    select max(day)::text as last_day from ad_stats where store_id = ${store.id}`;
  return Response.json({ lastDay: row.last_day });
}

export async function POST(request: Request) {
  const store = await storeForKey(request);
  if (!store) return Response.json({ error: "invalid key" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { customerId, currency, rows } = parsed.data;

  // Collapse duplicates (same day/item/campaign) so a single upsert never touches a row twice.
  const merged = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const itemId = r.itemId.toLowerCase();
    const k = `${r.date}|${itemId}|${r.campaignId}`;
    const prev = merged.get(k) as { impressions: number; clicks: number; cost: number; conversions: number; conv_value: number } | undefined;
    const ids = parseItemId(itemId);
    merged.set(k, {
      store_id: store.id,
      day: r.date,
      item_id: itemId,
      campaign_id: r.campaignId,
      campaign_name: r.campaignName ?? null,
      product_id: ids.productId,
      variant_id: ids.variantId,
      country: ids.country,
      impressions: (prev?.impressions ?? 0) + r.impressions,
      clicks: (prev?.clicks ?? 0) + r.clicks,
      cost: (prev?.cost ?? 0) + r.costMicros / 1e6,
      conversions: (prev?.conversions ?? 0) + r.conversions,
      conv_value: (prev?.conv_value ?? 0) + r.conversionsValue,
    });
  }
  const values = [...merged.values()];

  // 13 columns per row; keep each statement under Postgres' 65,535 parameter limit.
  for (let i = 0; i < values.length; i += 2000) {
    await sql`
      insert into ad_stats ${sql(values.slice(i, i + 2000))}
      on conflict (store_id, day, item_id, campaign_id) do update set
        campaign_name = excluded.campaign_name, impressions = excluded.impressions, clicks = excluded.clicks,
        cost = excluded.cost, conversions = excluded.conversions, conv_value = excluded.conv_value`;
  }
  await sql`update stores set ads_currency = ${currency.toUpperCase()}, ads_customer_id = ${customerId},
              ads_synced_at = now() where id = ${store.id}`;

  return Response.json({ ok: true, rows: values.length });
}
