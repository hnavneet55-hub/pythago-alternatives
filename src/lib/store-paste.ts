/**
 * Parses pasted store details, one block per store, e.g.
 *   Drosello
 *   Ad Account Currency - USD
 *   k0bpcz-nt.myshopify.com
 *   Client ID - c26949...
 *   Secret - shpss_...
 * A block starts at a line that is a store name (not a domain, Client ID, secret or currency line).
 * Lines can come in any order; duplicates of the same domain keep the last block.
 */
export type ParsedStore = { name: string; shopDomain: string | null; clientId: string | null; clientSecret: string | null };

export function parseStorePaste(text: string) {
  const blocks: ParsedStore[] = [];
  let cur: ParsedStore | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const value = line.replace(/^[^-:]*[-:]\s*/, "").replace(/\s+/g, "");
    const domain = /([a-z0-9][a-z0-9-]*\.myshopify\.com)/i.exec(line)?.[1]?.toLowerCase();
    if (/^client\s*id\b/i.test(line)) {
      if (cur) cur.clientId = value;
    } else if (/^(client\s*)?secret/i.test(line)) {
      if (cur) cur.clientSecret = value;
    } else if (/currency/i.test(line)) {
      // Currencies come from Shopify and the Google Ads script; nothing to store.
    } else if (domain) {
      if (cur) cur.shopDomain = domain;
    } else {
      // Anything else is a store name (names may contain dashes, e.g. "Avaro-Interiors").
      cur = { name: line, shopDomain: null, clientId: null, clientSecret: null };
      blocks.push(cur);
    }
  }
  const byDomain = new Map<string, ParsedStore>();
  const problems: string[] = [];
  for (const b of blocks) {
    if (!b.shopDomain || !b.clientId || !b.clientSecret) {
      const missing = [!b.shopDomain && "myshopify domain", !b.clientId && "Client ID", !b.clientSecret && "secret"].filter(Boolean);
      problems.push(`${b.name}: missing ${missing.join(", ")}`);
      continue;
    }
    byDomain.set(b.shopDomain, b);
  }
  return { stores: [...byDomain.values()], problems };
}
