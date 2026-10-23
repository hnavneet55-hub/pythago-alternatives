// Fills the database with fake data for two demo stores so the dashboard can be tried
// before real stores are connected. Remove with: pnpm db:seed-demo --remove
import postgres from "postgres";
import { randomBytes } from "node:crypto";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

await sql`delete from stores where shop_domain like 'demo-%.myshopify.com'`;
if (process.argv.includes("--remove")) {
  console.log("Demo data removed");
  await sql.end();
  process.exit(0);
}

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

const names = [
  "Waterproof Ankle Boots Womens", "Slip On Sneakers Womens", "Ankle Boots Womens Orthopedic",
  "Cashmere Cardigan Womens", "Boho Maxi Dress Womens", "Men's Casual Oxford Dress Shoes",
  "Flannel Shirt Jacket Mens", "Women's Sequin Long Sleeve Dress", "Women's Sequin Tassel Cardigan",
  "Leather Chelsea Boots Mens", "Wool Blend Coat Womens", "Knitted Turtleneck Sweater",
  "Wide Leg Linen Trousers", "Quilted Puffer Vest", "Suede Loafers Mens", "Platform Sandals Womens",
  "Cable Knit Beanie", "Denim Trucker Jacket", "Satin Slip Skirt", "Corduroy Overshirt Mens",
];
const sizes = ["36", "37", "38", "39", "40", "41", "42"];
const colors = ["Black", "Brown", "Beige", "Navy", "Green"];

// FX: rough fixed rates for the demo period
const fx = { USD: 1.08, GBP: 0.85 };
const fxRows = [];
for (let i = 0; i <= 120; i++) for (const [c, r] of Object.entries(fx)) fxRows.push({ day: day(i), currency: c, per_eur: r });
await sql`insert into fx_rates ${sql(fxRows)} on conflict do nothing`;

const demoStores = [
  { name: "Demo Store US", domain: "demo-us.myshopify.com", currency: "USD", country: "us" },
  { name: "Demo Store DE", domain: "demo-de.myshopify.com", currency: "EUR", country: "de" },
];

let pid = 8_400_000_000_000;
let vid = 47_000_000_000_000;
let lid = 1;

for (const ds of demoStores) {
  const [store] = await sql<{ id: number }[]>`
    insert into stores (name, shop_domain, shop_currency, timezone, ads_currency, ingest_key,
                        products_synced_at, orders_synced_at, ads_synced_at)
    values (${ds.name}, ${ds.domain}, ${ds.currency}, 'Europe/Berlin', ${ds.currency},
            ${"demo-" + randomBytes(8).toString("hex")}, now(), now(), now() - interval '3 hours')
    returning id`;

  for (const title of names) {
    const productId = String(pid++);
    const price = pick([44.95, 49.95, 54.95, 59.95, 79.95]);
    const cost = Math.round(price * (0.3 + rand() * 0.15) * 100) / 100;
    const variants = [];
    for (const c of colors.slice(0, 2 + Math.floor(rand() * 4)))
      for (const s of sizes) variants.push({ id: String(vid++), title: `${c} / ${s}`, sku: `${title.slice(0, 3).toUpperCase()}-${c.slice(0, 2).toUpperCase()}-${s}` });

    await sql`insert into products ${sql({
      store_id: store.id, id: productId, title, handle: title.toLowerCase().replaceAll(" ", "-"),
      status: rand() > 0.1 ? "ACTIVE" : "DRAFT", image_url: null, price, tags: [pick(["winter", "summer", "bestseller", "test"])],
      variant_count: variants.length,
    })}`;
    await sql`insert into variants ${sql(variants.map((v) => ({ store_id: store.id, id: v.id, product_id: productId, sku: v.sku, title: v.title, price, unit_cost: cost })))}`;

    const strength = rand(); // how well this product performs
    const ads = [];
    const lines = [];
    const refunds = [];
    for (let d = 0; d < 90; d++) {
      for (const v of variants) {
        if (rand() > 0.35) continue;
        const clicks = Math.floor(rand() * 12 * (0.5 + strength));
        const impressions = clicks * Math.floor(40 + rand() * 60) + Math.floor(rand() * 200);
        const cpc = 0.4 + rand() * 0.7;
        const orders = rand() < clicks * 0.022 * (0.4 + strength * 1.8) ? 1 + (rand() > 0.85 ? 1 : 0) : 0;
        ads.push({
          store_id: store.id, day: day(d), item_id: `shopify_${ds.country}_${productId}_${v.id}`,
          campaign_id: "2000000001", campaign_name: "PMax | All Products", product_id: productId, variant_id: v.id,
          country: ds.country.toUpperCase(), impressions, clicks, cost: Math.round(clicks * cpc * 100) / 100,
          conversions: orders, conv_value: orders * price,
        });
        for (let o = 0; o < orders; o++) {
          const id = lid++;
          lines.push({
            store_id: store.id, id, order_id: id, order_name: `#${1000 + id}`, day: day(d), country: ds.country.toUpperCase(),
            product_id: productId, variant_id: v.id, quantity: 1, revenue_shop: price, revenue_presentment: price,
            presentment_currency: ds.currency, cancelled: false,
          });
          if (rand() < 0.03 && d > 2) {
            refunds.push({
              store_id: store.id, id, order_id: id, line_item_id: id, day: day(d - 2), country: ds.country.toUpperCase(),
              product_id: productId, variant_id: v.id, quantity: 1, amount_shop: price, amount_presentment: price,
              presentment_currency: ds.currency,
            });
          }
        }
      }
    }
    for (let i = 0; i < ads.length; i += 2000) await sql`insert into ad_stats ${sql(ads.slice(i, i + 2000))}`;
    for (let i = 0; i < lines.length; i += 2000) await sql`insert into order_lines ${sql(lines.slice(i, i + 2000))}`;
    if (refunds.length) await sql`insert into refund_lines ${sql(refunds)}`;
  }
  console.log(`Seeded ${ds.name}`);
}
await sql.end();
