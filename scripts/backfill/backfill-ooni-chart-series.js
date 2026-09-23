// Adds the series shown on an OONI alert (metadata.rawAPIResponse.chart: 14 rolling
// blocks of 24 hours per watched domain, ending where the alert's window ends) to
// alerts that do not have one: alerts created before the channel started storing
// it, and alerts loaded from a generated backfill file. Alerts that hold the
// earlier calendar-day shape (no "starts") are redone too.
//
// OONI's API is rate limited per IP, and its hourly grain is refused for ranges
// longer than 7 days. So this does not ask once per alert. For each network it
// asks for the whole date range in 7-day windows and cuts every alert's 14 blocks
// out of that. About 290 days for one network is roughly 42 requests.
//
// Safe to re-run: an alert is written as soon as all its hours have arrived, so
// a stop (for example a rate limit) keeps its progress, and a re-run only does
// what is left.
//
// Usage: node scripts/backfill/backfill-ooni-chart-series.js [--dry-run]
//          [--asn=44244] [--chunk-days=7] [--max-requests=60]

require('dotenv').config();
const database = require('../../backend/database');
const mongoose = database.mongoose;
const Report = require('../../backend/models/report');
const { fetchDailyMeasurements } = require('../../backend/fetching/ooniApi');
const {
  MAX_HOURLY_RANGE_DAYS,
  shiftDay,
  chartAnchor,
  seriesRange,
  indexRows,
  seriesFromIndex,
} = require('../../backend/fetching/ooniSeries');
const defaultDomainConfig = require('../../backend/fetching/config/ooni.json');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const DRY_RUN = args.includes('--dry-run');
const ONLY_ASN = flag('asn') ? Number(flag('asn')) : null;
const CHUNK_DAYS = Math.min(Number(flag('chunk-days', MAX_HOURLY_RANGE_DAYS)), MAX_HOURLY_RANGE_DAYS);
const MAX_REQUESTS = Number(flag('max-requests', 60));

const REQUEST_DELAY_MS = 1000;
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(options) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const rows = await fetchDailyMeasurements(options);
      await sleep(REQUEST_DELAY_MS);
      return rows;
    } catch (error) {
      if (error.status !== 429 || attempt === RETRY_DELAYS_MS.length) throw error;
      const waitMs = error.retryAfterSeconds
        ? error.retryAfterSeconds * 1000
        : RETRY_DELAYS_MS[attempt];
      console.error(`Rate limited by OONI, waiting ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
    }
  }
  return [];
}

// Every whole date that holds an hour of this alert's series.
function neededDays(anchor) {
  const { sinceDay, untilDay } = seriesRange(anchor);
  const days = [];
  for (let d = sinceDay; d < untilDay; d = shiftDay(d, 1)) days.push(d);
  return days;
}

async function run() {
  const found = await Report.find({
    _media: 'ooni',
    'metadata.rawAPIResponse.domainMode': 'selected',
    $or: [
      { 'metadata.rawAPIResponse.chart': { $exists: false } },
      { 'metadata.rawAPIResponse.chart.starts': { $exists: false } },
    ],
  })
    .select('guid metadata.rawAPIResponse.probeASN metadata.rawAPIResponse.windowEnd metadata.rawAPIResponse.configuredDomains')
    .lean();

  const byAsn = new Map();
  for (const report of found) {
    const raw = report.metadata.rawAPIResponse;
    const asn = Number(raw.probeASN);
    if (!asn || !raw.windowEnd || (ONLY_ASN && asn !== ONLY_ASN)) continue;
    const anchor = chartAnchor(raw.windowEnd);
    const list = byAsn.get(asn) || [];
    list.push({
      id: report._id,
      guid: report.guid,
      anchor,
      days: neededDays(anchor),
      domains: raw.configuredDomains?.length ? raw.configuredDomains : defaultDomainConfig.domains,
    });
    byAsn.set(asn, list);
  }

  const total = [...byAsn.values()].reduce((n, list) => n + list.length, 0);
  console.log(`OONI alerts needing a chart: ${total}${DRY_RUN ? ' [DRY-RUN, no OONI calls, no writes]' : ''}`);
  if (total === 0) return;

  let requests = 0;
  let written = 0;
  let stopped = null;

  for (const [asn, reports] of byAsn) {
    const needed = [...new Set(reports.flatMap((r) => r.days))].sort();

    // Windows of at most CHUNK_DAYS whole dates, skipping stretches nobody needs.
    const windows = [];
    for (let i = 0; i < needed.length; ) {
      const since = needed[i];
      const stop = shiftDay(since, CHUNK_DAYS);
      const last = needed.filter((d) => d < stop).pop();
      windows.push({ since, until: shiftDay(last, 1) });
      while (i < needed.length && needed[i] < stop) i += 1;
    }
    console.log(`AS${asn}: ${reports.length} alert(s), ${needed.length} day(s) needed, ${windows.length} request(s)`);
    if (DRY_RUN) {
      requests += windows.length;
      continue;
    }

    const allDomains = [...new Set(reports.flatMap((r) => r.domains))];
    const index = new Map();
    const fetched = new Set();
    const pending = new Set(reports);

    for (const window of windows) {
      if (requests >= MAX_REQUESTS) {
        stopped = `reached --max-requests=${MAX_REQUESTS}`;
        break;
      }
      let rows;
      try {
        rows = await fetchWithRetry({
          asn,
          since: window.since,
          until: window.until,
          axisY: 'domain',
          timeGrain: 'hour',
        });
      } catch (error) {
        stopped = `OONI request failed (${error.status || error.message}); re-run later to continue`;
        break;
      }
      requests += 1;
      indexRows(rows, allDomains, index);
      for (let d = window.since; d < window.until; d = shiftDay(d, 1)) fetched.add(d);
      console.log(`  fetched ${window.since} to ${window.until} (${rows.length} rows)`);

      // Write every alert whose hours are now all in hand.
      const fetchedAt = new Date().toISOString();
      const ready = [...pending].filter((r) => r.days.every((d) => fetched.has(d)));
      if (ready.length > 0) {
        await Report.bulkWrite(ready.map((r) => ({
          updateOne: {
            filter: { _id: r.id },
            update: {
              $set: {
                'metadata.rawAPIResponse.chart': {
                  ...seriesFromIndex(index, { anchor: r.anchor, domains: r.domains }),
                  fetchedAt,
                },
              },
            },
          },
        })));
        ready.forEach((r) => pending.delete(r));
        written += ready.length;
      }
    }
    if (stopped) break;
  }

  console.log(`\nOONI requests: ${requests}. Alerts updated: ${written}.`);
  if (stopped) console.log(`Stopped early: ${stopped}.`);
}

run()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect())
  .then(() => process.exit(process.exitCode || 0));
