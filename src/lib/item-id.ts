// Google Merchant Center item ids from the Shopify Google channel look like
// shopify_us_8490812702767_47004975956015 (country, product id, variant id).
export function parseItemId(itemId: string) {
  const m = /^shopify_([a-z]{2})_(\d+)_(\d+)$/i.exec(itemId.trim());
  if (!m) return { country: null, productId: null, variantId: null };
  return { country: m[1].toUpperCase(), productId: m[2], variantId: m[3] };
}
