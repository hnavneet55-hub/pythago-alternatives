/** Google Ads script the user pastes into Tools → Bulk actions → Scripts, scheduled hourly. */
export function adsScript(endpoint: string, ingestKey: string) {
  return `/**
 * AdProfit – sends product-level (SKU) Performance Max / Shopping stats to the dashboard.
 * Schedule: Hourly. Nothing needs editing for normal use.
 *
 *  - Normal hourly run: refreshes the last 3 days (fast).
 *  - First run, after a pause of more than 3 days, and once a day at 3am (account time):
 *    refreshes the last 35 days, so late Google conversions are picked up.
 *  - Older history (optional, one time): set BACKFILL_FROM below, click Run, then set it back to ''.
 *    Long backfills stop safely before Google's 30-minute limit and log where to continue.
 */
var ENDPOINT = '${endpoint}';
var INGEST_KEY = '${ingestKey}';

var BACKFILL_FROM = '';   // e.g. '2026-07-01' to import older history once; leave '' normally
var BACKFILL_TO = '';     // optional end date for a backfill; leave '' for today

var QUICK_DAYS = 3;
var FULL_DAYS = 35;
var FULL_REFRESH_HOUR = 3;
var WINDOW_DAYS = 7;      // days read per query
var BATCH_SIZE = 5000;    // rows per upload
var PARALLEL = 4;         // uploads sent at the same time
var TIME_LIMIT_MS = 25 * 60 * 1000;

var started = Date.now();
var pending = [];
var sent = 0;

function main() {
  var account = AdsApp.currentAccount();
  var tz = account.getTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var end = BACKFILL_TO || today;
  var start;
  var mode;

  if (BACKFILL_FROM) {
    start = BACKFILL_FROM;
    mode = 'backfill';
  } else {
    var hour = parseInt(Utilities.formatDate(new Date(), tz, 'H'), 10);
    var lastDay = getLastDay();
    var full = hour === FULL_REFRESH_HOUR || !lastDay || lastDay < shift(today, -QUICK_DAYS);
    start = shift(today, -((full ? FULL_DAYS : QUICK_DAYS) - 1));
    mode = full ? 'full refresh' : 'quick refresh';
  }
  Logger.log('AdProfit ' + mode + ': ' + start + ' to ' + end);

  var windowEnd = end;
  while (windowEnd >= start) {
    if (Date.now() - started > TIME_LIMIT_MS) {
      flush(account);
      Logger.log('Stopped early to stay under the 30-minute limit. Sent ' + sent + ' rows.');
      Logger.log("Not imported yet: " + start + ' to ' + windowEnd +
        ". To continue, set BACKFILL_FROM = '" + start + "' and BACKFILL_TO = '" + windowEnd + "', then click Run.");
      return;
    }
    var windowStart = shift(windowEnd, -(WINDOW_DAYS - 1));
    if (windowStart < start) windowStart = start;
    readWindow(account, windowStart, windowEnd);
    windowEnd = shift(windowStart, -1);
  }
  flush(account);
  Logger.log('Sent ' + sent + ' rows for ' + start + ' to ' + end + ' in ' +
    Math.round((Date.now() - started) / 1000) + 's');
}

function readWindow(account, from, to) {
  var rows = AdsApp.search(
    'SELECT segments.date, segments.product_item_id, campaign.id, campaign.name, ' +
    'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value ' +
    'FROM shopping_performance_view ' +
    "WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.impressions > 0"
  );
  var batch = [];
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
    if (batch.length >= BATCH_SIZE) { queue(account, batch); batch = []; }
  }
  if (batch.length) queue(account, batch);
}

function queue(account, rows) {
  pending.push(rows);
  if (pending.length >= PARALLEL) flush(account);
}

function flush(account) {
  if (!pending.length) return;
  var customerId = account.getCustomerId();
  var currency = account.getCurrencyCode();
  var requests = pending.map(function (rows) {
    return {
      url: ENDPOINT,
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-ingest-key': INGEST_KEY },
      payload: JSON.stringify({ customerId: customerId, currency: currency, rows: rows }),
      muteHttpExceptions: true
    };
  });
  var responses = UrlFetchApp.fetchAll(requests);
  for (var i = 0; i < responses.length; i++) {
    if (responses[i].getResponseCode() !== 200) {
      throw new Error('AdProfit upload failed (' + responses[i].getResponseCode() + '): ' + responses[i].getContentText());
    }
    sent += pending[i].length;
  }
  pending = [];
}

function getLastDay() {
  var res = UrlFetchApp.fetch(ENDPOINT, { headers: { 'x-ingest-key': INGEST_KEY }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('AdProfit check failed (' + res.getResponseCode() + '): ' + res.getContentText());
  }
  return JSON.parse(res.getContentText()).lastDay;
}

// Adds n days to a yyyy-MM-dd date string.
function shift(day, n) {
  var d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}
`;
}
