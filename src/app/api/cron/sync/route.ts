import { syncAllStores } from "@/lib/shopify";
import { syncFxRates } from "@/lib/fx";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 300;

// Called by Vercel Cron (Authorization: Bearer $CRON_SECRET).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const fx = await syncFxRates().catch((e: Error) => `error: ${e.message}`);
  const stores = await syncAllStores();
  return Response.json({ fx, stores });
}
