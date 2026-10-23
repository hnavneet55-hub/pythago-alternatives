-- AdProfit schema. Safe to run repeatedly (pnpm db:migrate).

create table if not exists stores (
  id                 serial primary key,
  name               text not null,
  shop_domain        text not null unique,           -- e.g. my-store.myshopify.com
  shop_currency      text,                           -- Shopify store currency
  timezone           text,                           -- Shopify IANA timezone
  ads_currency       text,                           -- Google Ads account currency (display currency)
  ads_customer_id    text,
  client_id          text,                           -- Dev Dashboard app (client credentials grant)
  client_secret_enc  text,
  access_token_enc   text,                           -- static admin token (legacy custom apps)
  ingest_key         text not null unique,           -- secret used by the Google Ads script
  orders_cursor      text,                           -- resumable order sync state
  orders_sync_from   timestamptz,
  orders_synced_at   timestamptz,
  products_synced_at timestamptz,
  ads_synced_at      timestamptz,
  last_sync_error    text,
  created_at         timestamptz not null default now()
);

create table if not exists products (
  store_id      int not null references stores(id) on delete cascade,
  id            bigint not null,                     -- Shopify product id
  title         text not null,
  handle        text,
  status        text,                                -- ACTIVE | DRAFT | ARCHIVED
  image_url     text,
  price         numeric,                             -- lowest variant price (shop currency)
  tags          text[] not null default '{}',
  variant_count int not null default 0,
  cogs_override numeric,                             -- per-unit cost override (shop currency)
  updated_at    timestamptz not null default now(),
  primary key (store_id, id)
);

create table if not exists variants (
  store_id   int not null references stores(id) on delete cascade,
  id         bigint not null,                        -- Shopify variant id
  product_id bigint not null,
  sku        text,
  title      text,
  price      numeric,
  unit_cost  numeric,                                -- Shopify "cost per item" (shop currency)
  primary key (store_id, id)
);
create index if not exists variants_product on variants (store_id, product_id);

create table if not exists order_lines (
  store_id               int not null references stores(id) on delete cascade,
  id                     bigint not null,            -- line item id
  order_id               bigint not null,
  order_name             text,
  day                    date not null,              -- order date in store timezone
  country                text,                       -- shipping country (ISO-2)
  product_id             bigint,
  variant_id             bigint,
  quantity               int not null,
  revenue_shop           numeric not null,           -- after discounts, shop currency
  revenue_presentment    numeric not null,           -- after discounts, customer currency
  presentment_currency   text not null,
  cancelled              boolean not null default false,
  primary key (store_id, id)
);
create index if not exists order_lines_day on order_lines (store_id, day);

create table if not exists refund_lines (
  store_id             int not null references stores(id) on delete cascade,
  id                   bigint not null,              -- refund line item id
  order_id             bigint not null,
  line_item_id         bigint,
  day                  date not null,                -- refund date in store timezone
  country              text,
  product_id           bigint,
  variant_id           bigint,
  quantity             int not null,
  amount_shop          numeric not null,
  amount_presentment   numeric not null,
  presentment_currency text not null,
  primary key (store_id, id)
);
create index if not exists refund_lines_day on refund_lines (store_id, day);

create table if not exists ad_stats (
  store_id      int not null references stores(id) on delete cascade,
  day           date not null,
  item_id       text not null,                       -- shopify_us_<product>_<variant>
  campaign_id   bigint not null,
  campaign_name text,
  product_id    bigint,
  variant_id    bigint,
  country       text,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  cost          numeric not null default 0,          -- ads account currency
  conversions   numeric not null default 0,
  conv_value    numeric not null default 0,
  primary key (store_id, day, item_id, campaign_id)
);
create index if not exists ad_stats_product on ad_stats (store_id, product_id, day);

-- Daily ECB reference rates: 1 EUR = per_eur units of currency.
create table if not exists fx_rates (
  day      date not null,
  currency text not null,
  per_eur  numeric not null,
  primary key (currency, day)
);

-- Rate to convert an amount from one currency to another on a given day,
-- using the latest published rate on or before that day.
create or replace function fx(src text, dst text, d date) returns numeric
language sql stable as $$
  select case
    when src is null or dst is null or src = dst then 1
    else
      (case when dst = 'EUR' then 1 else
        (select per_eur from fx_rates where currency = dst and day <= d order by day desc limit 1) end)
      /
      nullif(case when src = 'EUR' then 1 else
        (select per_eur from fx_rates where currency = src and day <= d order by day desc limit 1) end, 0)
  end
$$;

-- Fallback cost of goods as % of revenue, used when a variant has no Shopify cost per item.
alter table stores add column if not exists default_cogs_pct numeric
  check (default_cogs_pct is null or (default_cogs_pct >= 0 and default_cogs_pct < 100));

-- Cost of goods from the Profit-Sheet app, per order line, in shop currency.
--   invoice        supplier-invoiced order cost, split across the order's lines
--   invoice_avg    product's average invoiced cost per unit (order not invoiced yet)
--   sheet_estimate Profit-Sheet SKU cost estimate
alter table order_lines add column if not exists ext_cogs numeric;
alter table order_lines add column if not exists ext_cogs_source text;
alter table products add column if not exists invoiced_unit_cost numeric;
alter table stores add column if not exists cogs_imported_at timestamptz;
alter table stores add column if not exists cogs_import_error text;

alter table products add column if not exists published_at timestamptz;   -- Shopify publishedAt
