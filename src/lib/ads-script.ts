/** Google Ads script the user pastes into Tools → Bulk actions → Scripts, scheduled hourly. */
export function adsScript(endpoint: string, ingestKey: string) {
  return `/**
 * AdProfit – sends product-level (SKU) Performance Max / Shopping stats to the dashboard.
 * Schedule: Hourly.  First run: set DAYS_BACK to 90 to backfill, then set it back to 35.
 */
var ENDPOINT = '${endpoint}';
var INGEST_KEY = '${ingestKey}';
var DAYS_BACK = 35;
var BATCH_SIZE = 4000;

function main() {
  var account = AdsApp.currentAccount();
  var tz = account.getTimeZone();
  var end = new Date();
  var start = new Date(end.getTime() - (DAYS_BACK - 1) * 86400000);
  var fmt = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };

  var query =
    'SELECT segments.date, segments.product_item_id, campaign.id, campaign.name, ' +
    'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value ' +
    'FROM shopping_performance_view ' +
    "WHERE segments.date BETWEEN '" + fmt(start) + "' AND '" + fmt(end) + "' AND metrics.impressions > 0";

  var rows = AdsApp.search(query);
  var batch = [];
  var total = 0;
  while (rows.hasNext()) {
    var r = rows.next();
    batch.push({
      date: r.segments.date,
      itemId: r.segments.productItemId,
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      impressions: r.metrics.impressions || 0,
      clicks: r.metrics.clicks || 0,
      costMicros: r.metrics.costMicros || 0,
      conversions: r.metrics.conversions || 0,
      conversionsValue: r.metrics.conversionsValue || 0
    });
    if (batch.length >= BATCH_SIZE) { send(account, batch); total += batch.length; batch = []; }
  }
  if (batch.length) { send(account, batch); total += batch.length; }
  Logger.log('Sent ' + total + ' rows for ' + fmt(start) + ' to ' + fmt(end));
}

function send(account, rows) {
  var res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-key': INGEST_KEY },
    payload: JSON.stringify({
      customerId: account.getCustomerId(),
      currency: account.getCurrencyCode(),
      rows: rows
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('AdProfit upload failed (' + res.getResponseCode() + '): ' + res.getContentText());
  }
}
`;
}
