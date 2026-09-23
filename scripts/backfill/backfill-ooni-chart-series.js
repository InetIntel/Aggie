// Adds the 14-day per-domain measurement series (metadata.rawAPIResponse.chart)
// to OONI alerts that do not have one yet: alerts created before the channel
// started storing it, and alerts loaded from a generated backfill file.
//
// OONI's API is rate limited per IP and a per-domain request is expensive, so
// this does not ask once per alert. It asks for the whole date range in a few
// large windows per network (default 30 days each) and cuts every alert's 14
// days out of that. A backfill of about 290 days for two networks is around 20
// requests.
//
// Safe to re-run: only alerts without a chart are touched, and alerts whose
// days were fully fetched are written as soon as each window arrives, so a stop
// (for example a rate limit) keeps its progress.
//
// Usage: node scripts/backfill/backfill-ooni-chart-series.js [--dry-run]
//          [--asn=44244] [--chunk-days=30] [--max-requests=40]

require('dotenv').config();
const database = require('../../backend/database');
const mongoose = database.mongoose;
const Report = require('../../backend/models/report');
const { fetchDailyMeasurements } = require('../../backend/fetching/ooniApi');
const {
  SERIES_DAYS,
  shiftDay,
  chartEndDay,
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
const CHUNK_DAYS = Number(flag('chunk-days', 30));
const MAX_REQUESTS = Number(flag('max-requests', 40));

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

async function run() {
  const found = await Report.find({
    _media: 'ooni',
    'metadata.rawAPIResponse.domainMode': 'selected',
    'metadata.rawAPIResponse.chart': { $exists: false },
  })
    .select('guid metadata.rawAPIResponse.probeASN metadata.rawAPIResponse.windowEnd metadata.rawAPIResponse.configuredDomains')
    .lean();

  const byAsn = new Map();
  for (const report of found) {
    const raw = report.metadata.rawAPIResponse;
    const asn = Number(raw.probeASN);
    if (!asn || !raw.windowEnd || (ONLY_ASN && asn !== ONLY_ASN)) continue;
    const list = byAsn.get(asn) || [];
    list.push({
      id: report._id,
      guid: report.guid,
      endDay: chartEndDay(raw.windowEnd),
      domains: raw.configuredDomains?.length ? raw.configuredDomains : defaultDomainConfig.domains,
    });
    byAsn.set(asn, list);
  }

  const total = [...byAsn.values()].reduce((n, list) => n + list.length, 0);
  console.log(`OONI alerts without a chart: ${total}${DRY_RUN ? ' [DRY-RUN, no OONI calls, no writes]' : ''}`);
  if (total === 0) return;

  let requests = 0;
  let written = 0;
  let stopped = null;

  for (const [asn, reports] of byAsn) {
    const needed = new Set();
    for (const r of reports) {
      for (let i = 0; i < SERIES_DAYS; i += 1) needed.add(shiftDay(r.endDay, -i));
    }
    const days = [...needed].sort();
    const first = days[0];
    const last = days[days.length - 1];

    const windows = [];
    for (let start = first; start <= last; start = shiftDay(start, CHUNK_DAYS)) {
      const end = shiftDay(start, CHUNK_DAYS - 1);
      if (days.some((d) => d >= start && d <= end)) windows.push({ start, end: end > last ? last : end });
    }
    console.log(`AS${asn}: ${reports.length} alert(s), ${days.length} day(s) needed, ${windows.length} request(s)`);
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
          since: window.start,
          until: shiftDay(window.end, 1),
          axisY: 'domain',
        });
      } catch (error) {
        stopped = `OONI request failed (${error.status || error.message}); re-run later to continue`;
        break;
      }
      requests += 1;
      for (const [key, count] of indexRows(rows, allDomains)) index.set(key, count);
      for (let d = window.start; d <= window.end; d = shiftDay(d, 1)) fetched.add(d);
      console.log(`  fetched ${window.start} to ${window.end} (${rows.length} rows)`);

      // Write every alert whose 14 days are now all in hand.
      const fetchedAt = new Date().toISOString();
      const ready = [...pending].filter((r) =>
        Array.from({ length: SERIES_DAYS }, (_, i) => shiftDay(r.endDay, -i)).every((d) => fetched.has(d)));
      if (ready.length > 0) {
        await Report.bulkWrite(ready.map((r) => ({
          updateOne: {
            filter: { _id: r.id },
            update: {
              $set: {
                'metadata.rawAPIResponse.chart': {
                  ...seriesFromIndex(index, { endDay: r.endDay, domains: r.domains }),
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
