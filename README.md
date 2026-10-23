# AdProfit

Product-level profit for Shopify stores running Google Ads Performance Max — an in-house
alternative to Pythago. All SKUs of a product are combined and compared against ad spend
and Shopify revenue over the selected range and the last 7 / 14 / 30 days.

## How data flows

- **Google Ads → dashboard:** a Google Ads script per account (copy it from *Stores & setup*)
  runs hourly, reads `shopping_performance_view` per item ID / day / campaign, and posts it to
  `/api/ingest/google-ads`. Item IDs like `shopify_us_<productId>_<variantId>` map spend to the
  Shopify product and variant.
- **Shopify → dashboard:** `/api/cron/sync` (Vercel Cron, hourly) syncs products, variant costs
  and orders/refunds with the Admin GraphQL API. Order sync is incremental and resumable.
- **Currency:** a single store is shown in its Google Ads account currency. "All stores" uses
  `REPORTING_CURRENCY`. Conversions use daily ECB rates (frankfurter.dev).

## Formulas

- ROAS = Shopify revenue (after discounts, excl. tax/shipping) ÷ ad spend
- Net profit = revenue − refunds − COGS − ad spend; POAS = net profit ÷ ad spend
- COGS = units × Shopify "cost per item" (or the product's override)

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:migrate
pnpm db:seed-demo            # optional demo stores; remove with: pnpm db:seed-demo --remove
pnpm dev
```

## Deploying

Vercel project + Neon Postgres (Vercel Marketplace). Set the variables from `.env.example`,
run `pnpm db:migrate` against the production `DATABASE_URL`, and deploy.
