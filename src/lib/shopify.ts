import { sql } from "./db";
import { decrypt } from "./crypto";

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-07";
const INITIAL_SYNC_DAYS = Number(process.env.SHOPIFY_INITIAL_SYNC_DAYS ?? 60);

export type StoreRow = {
  id: number;
  name: string;
  shop_domain: string;
  shop_currency: string | null;
  timezone: string | null;
  ads_currency: string | null;
  client_id: string | null;
  client_secret_enc: string | null;
  access_token_enc: string | null;
  orders_cursor: string | null;
  orders_sync_from: Date | null;
  orders_synced_at: Date | null;
};

const tokenCache = new Map<number, { token: string; expiresAt: number }>();

async function getAccessToken(store: StoreRow) {
  if (store.access_token_enc) return decrypt(store.access_token_enc);
  if (!store.client_id || !store.client_secret_enc) throw new Error("Store has no Shopify credentials");

  const cached = tokenCache.get(store.id);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  // Client credentials grant (Dev Dashboard app installed on a store in the same organization).
  const res = await fetch(`https://${store.shop_domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: store.client_id,
      client_secret: decrypt(store.client_secret_enc),
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("shop_not_permitted")) {
      throw new Error(
        "Shopify refused the Client ID/secret for this store. The app and the store must be in the same Shopify organization, and the app must be installed on this store (see the Setup guide, part 1).",
      );
    }
    if (res.status === 400 || res.status === 401) {
      throw new Error(`Shopify rejected the Client ID or Client secret. Copy both again from the app's Settings page in the Dev Dashboard. (${text.slice(0, 200)})`);
    }
    throw new Error(`Shopify token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(store.id, { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

async function graphql<T>(store: StoreRow, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await getAccessToken(store);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Shopify denied access (${res.status}). Check that the app is installed on this store and its released version includes the required scopes.`,
      );
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`Shopify API error ${res.status}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const body = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    if (body.errors?.some((e) => e.extensions?.code === "THROTTLED") && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (body.errors?.length) {
      const err = new Error(`Shopify GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
      (err as Error & { accessDenied?: boolean }).accessDenied = body.errors.some(
        (e) => e.extensions?.code === "ACCESS_DENIED" || /access denied/i.test(e.message),
      );
      throw err;
    }
    return body.data as T;
  }
}

const gidNum = (gid: string | null | undefined) => (gid ? gid.slice(gid.lastIndexOf("/") + 1) : null);

function dayInZone(iso: string, timeZone: string) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

// ---------------------------------------------------------------- products

const PRODUCTS_QUERY = `query Products($cursor: String) {
  shop { name currencyCode ianaTimezone myshopifyDomain }
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle status tags
      featuredMedia { preview { image { url } } }
      variants(first: 250) {
        nodes { id sku title price inventoryItem { unitCost { amount currencyCode } } }
      }
    }
  }
}`;

type ProductsData = {
  shop: { name: string; currencyCode: string; ianaTimezone: string; myshopifyDomain: string };
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      title: string;
      handle: string;
      status: string;
      tags: string[];
      featuredMedia: { preview: { image: { url: string } | null } | null } | null;
      variants: {
        nodes: {
          id: string;
          sku: string | null;
          title: string;
          price: string;
          inventoryItem: { unitCost: { amount: string; currencyCode: string } | null } | null;
        }[];
      };
    }[];
  };
};

export async function syncProducts(store: StoreRow) {
  let cursor: string | null = null;
  let count = 0;
  const seen: string[] = [];
  do {
    const data: ProductsData = await graphql<ProductsData>(store, PRODUCTS_QUERY, { cursor });
    if (cursor === null) {
      await sql`update stores set shop_currency = ${data.shop.currencyCode}, timezone = ${data.shop.ianaTimezone}
                where id = ${store.id}`;
      store.shop_currency = data.shop.currencyCode;
      store.timezone = data.shop.ianaTimezone;
    }
    const products = data.products.nodes.map((p) => {
      const prices = p.variants.nodes.map((v) => Number(v.price)).filter((n) => !Number.isNaN(n));
      return {
        store_id: store.id,
        id: gidNum(p.id)!,
        title: p.title,
        handle: p.handle,
        status: p.status,
        image_url: p.featuredMedia?.preview?.image?.url ?? null,
        price: prices.length ? Math.min(...prices) : null,
        tags: p.tags,
        variant_count: p.variants.nodes.length,
      };
    });
    const variants = data.products.nodes.flatMap((p) =>
      p.variants.nodes.map((v) => ({
        store_id: store.id,
        id: gidNum(v.id)!,
        product_id: gidNum(p.id)!,
        sku: v.sku,
        title: v.title,
        price: v.price,
        unit_cost: v.inventoryItem?.unitCost?.amount ?? null,
      })),
    );
    if (products.length) {
      await sql`
        insert into products ${sql(products)}
        on conflict (store_id, id) do update set
          title = excluded.title, handle = excluded.handle, status = excluded.status,
          image_url = excluded.image_url, price = excluded.price, tags = excluded.tags,
          variant_count = excluded.variant_count, updated_at = now()`;
    }
    if (variants.length) {
      await sql`
        insert into variants ${sql(variants)}
        on conflict (store_id, id) do update set
          product_id = excluded.product_id, sku = excluded.sku, title = excluded.title,
          price = excluded.price, unit_cost = excluded.unit_cost`;
    }
    seen.push(...products.map((p) => p.id));
    count += products.length;
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  // Products deleted in Shopify: keep their history but mark them.
  await sql`update products set status = 'DELETED'
            where store_id = ${store.id} and status <> 'DELETED' and not (id::text = any(${seen}))`;
  await sql`update stores set products_synced_at = now() where id = ${store.id}`;
  return count;
}

// ---------------------------------------------------------------- orders

// Shipping country is protected customer data; if Shopify denies it we sync without it.
const ordersQuery = (withCountry: boolean) => `query Orders($cursor: String, $query: String) {
  orders(first: 50, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt updatedAt test cancelledAt currencyCode presentmentCurrencyCode
      ${withCountry ? "shippingAddress { countryCodeV2 }" : ""}
      lineItems(first: 100) {
        nodes {
          id quantity sku product { id } variant { id }
          originalTotalSet { shopMoney { amount } presentmentMoney { amount } }
          discountAllocations { allocatedAmountSet { shopMoney { amount } presentmentMoney { amount } } }
        }
      }
      refunds {
        id createdAt
        refundLineItems(first: 100) {
          nodes { id quantity lineItem { id } subtotalSet { shopMoney { amount } presentmentMoney { amount } } }
        }
      }
    }
  }
}`;

type Money = { shopMoney: { amount: string }; presentmentMoney: { amount: string } };
type OrdersData = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      name: string;
      createdAt: string;
      test: boolean;
      cancelledAt: string | null;
      presentmentCurrencyCode: string;
      shippingAddress?: { countryCodeV2: string | null } | null;
      lineItems: {
        nodes: {
          id: string;
          quantity: number;
          product: { id: string } | null;
          variant: { id: string } | null;
          originalTotalSet: Money;
          discountAllocations: { allocatedAmountSet: Money }[];
        }[];
      };
      refunds: {
        id: string;
        createdAt: string;
        refundLineItems: {
          nodes: { id: string; quantity: number; lineItem: { id: string } | null; subtotalSet: Money }[];
        };
      }[];
    }[];
  };
};

/**
 * Incremental, resumable order sync. Fetches orders updated since the last completed
 * sync (or the last N days on first run) and stops when `deadline` is reached, saving
 * the cursor so the next call continues where this one stopped.
 */
export async function syncOrders(store: StoreRow, deadline: number) {
  if (!store.timezone) throw new Error("Sync products first (store timezone unknown)");
  const tz = store.timezone;

  let from = store.orders_sync_from;
  if (!from) {
    from = store.orders_synced_at
      ? new Date(store.orders_synced_at.getTime() - 2 * 3_600_000)
      : new Date(Date.now() - INITIAL_SYNC_DAYS * 86_400_000);
    await sql`update stores set orders_sync_from = ${from}, orders_cursor = null where id = ${store.id}`;
  }
  let cursor = store.orders_cursor;
  let count = 0;
  let withCountry = true;

  while (true) {
    const variables = { cursor, query: `updated_at:>='${from.toISOString()}'` };
    let data: OrdersData;
    try {
      data = await graphql<OrdersData>(store, ordersQuery(withCountry), variables);
    } catch (e) {
      if (!withCountry || !(e as { accessDenied?: boolean }).accessDenied) throw e;
      withCountry = false;
      data = await graphql<OrdersData>(store, ordersQuery(false), variables);
    }

    const lines = [];
    const refunds = [];
    for (const o of data.orders.nodes) {
      if (o.test) continue;
      const orderId = gidNum(o.id)!;
      const country = o.shippingAddress?.countryCodeV2 ?? null;
      const byLine = new Map<string, { product: string | null; variant: string | null }>();
      for (const li of o.lineItems.nodes) {
        const disc = (k: "shopMoney" | "presentmentMoney") =>
          li.discountAllocations.reduce((s, d) => s + Number(d.allocatedAmountSet[k].amount), 0);
        const product = gidNum(li.product?.id);
        const variant = gidNum(li.variant?.id);
        byLine.set(li.id, { product, variant });
        lines.push({
          store_id: store.id,
          id: gidNum(li.id)!,
          order_id: orderId,
          order_name: o.name,
          day: dayInZone(o.createdAt, tz),
          country,
          product_id: product,
          variant_id: variant,
          quantity: li.quantity,
          revenue_shop: Number(li.originalTotalSet.shopMoney.amount) - disc("shopMoney"),
          revenue_presentment: Number(li.originalTotalSet.presentmentMoney.amount) - disc("presentmentMoney"),
          presentment_currency: o.presentmentCurrencyCode,
          cancelled: o.cancelledAt !== null,
        });
      }
      for (const r of o.refunds) {
        for (const rl of r.refundLineItems.nodes) {
          const ref = rl.lineItem ? byLine.get(rl.lineItem.id) : undefined;
          refunds.push({
            store_id: store.id,
            id: gidNum(rl.id)!,
            order_id: orderId,
            line_item_id: gidNum(rl.lineItem?.id),
            day: dayInZone(r.createdAt, tz),
            country,
            product_id: ref?.product ?? null,
            variant_id: ref?.variant ?? null,
            quantity: rl.quantity,
            amount_shop: Number(rl.subtotalSet.shopMoney.amount),
            amount_presentment: Number(rl.subtotalSet.presentmentMoney.amount),
            presentment_currency: o.presentmentCurrencyCode,
          });
        }
      }
    }

    if (lines.length) {
      await sql`
        insert into order_lines ${sql(lines)}
        on conflict (store_id, id) do update set
          day = excluded.day, country = excluded.country, product_id = excluded.product_id,
          variant_id = excluded.variant_id, quantity = excluded.quantity,
          revenue_shop = excluded.revenue_shop, revenue_presentment = excluded.revenue_presentment,
          presentment_currency = excluded.presentment_currency, cancelled = excluded.cancelled`;
    }
    if (refunds.length) {
      await sql`
        insert into refund_lines ${sql(refunds)}
        on conflict (store_id, id) do update set
          day = excluded.day, quantity = excluded.quantity,
          amount_shop = excluded.amount_shop, amount_presentment = excluded.amount_presentment`;
    }
    count += data.orders.nodes.length;

    const { hasNextPage, endCursor } = data.orders.pageInfo;
    if (!hasNextPage) {
      await sql`update stores set orders_cursor = null, orders_sync_from = null, orders_synced_at = now()
                where id = ${store.id}`;
      return { count, done: true };
    }
    cursor = endCursor;
    await sql`update stores set orders_cursor = ${cursor} where id = ${store.id}`;
    if (Date.now() > deadline) return { count, done: false };
  }
}

export async function getStores() {
  return sql<StoreRow[]>`select * from stores order by name`;
}

/** Sync products then orders for every store within the time budget. */
export async function syncAllStores(budgetMs = 240_000) {
  const deadline = Date.now() + budgetMs;
  const results = [];
  for (const store of await getStores()) {
    try {
      const products = await syncProducts(store);
      const orders = await syncOrders(store, deadline);
      await sql`update stores set last_sync_error = null where id = ${store.id}`;
      results.push({ store: store.name, products, ...orders });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await sql`update stores set last_sync_error = ${message} where id = ${store.id}`;
      results.push({ store: store.name, error: message });
    }
    if (Date.now() > deadline) break;
  }
  return results;
}

// ---------------------------------------------------------------- product status

export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED", "UNLISTED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const SET_STATUS_MUTATION = `mutation SetStatus($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id status }
    userErrors { field message }
  }
}`;

type SetStatusData = {
  productUpdate: { product: { id: string; status: string } | null; userErrors: { field: string[] | null; message: string }[] };
};

/** Changes a product's status in Shopify and in our copy. Needs the write_products scope. */
export async function setProductStatus(store: StoreRow, productId: string, status: ProductStatus) {
  let data: SetStatusData;
  try {
    data = await graphql<SetStatusData>(store, SET_STATUS_MUTATION, {
      product: { id: `gid://shopify/Product/${productId}`, status },
    });
  } catch (e) {
    if ((e as { accessDenied?: boolean }).accessDenied) {
      throw new Error("Shopify denied the change: add the write_products scope to the app (Setup guide, step 1.3) and approve it in the store.");
    }
    throw e;
  }
  const errors = data.productUpdate.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  const newStatus = data.productUpdate.product?.status ?? status;
  await sql`update products set status = ${newStatus}, updated_at = now() where store_id = ${store.id} and id = ${productId}`;
  return newStatus;
}
