// Generates a MongoDB-importable file of OONI alert reports for a historical
// date range, using the exact same alert logic and document shape the live
// OONIChannel produces (backend/fetching/channels/ooni.js) - so the result is
// indistinguishable from what would have been created if the channel had been
// running the whole time. This script never connects to or writes into any
// remote/published database; it only produces a file. Import it yourself with:
//
//   mongoimport --uri "<your published DATABASE_URL>/aggie" --collection reports --file data/ooni-alerts-backfill.jsonl
//
// (no --jsonArray flag - this is one JSON document per line)
//
// Every field is written as MongoDB Extended JSON ($date / $oid) so imported
// documents get real Date/ObjectId types, not plain strings - consistent with
// every other document already in the reports collection.
//
// Guids are deterministic (ooni:<asn>:<mode>:<date>), same as production, so
// re-running this or importing over a database that already has some of these
// alerts (e.g. from a live channel) will safely fail only on the guid unique
// index for the ones that already exist - mongoimport continues past those by
// default rather than aborting the whole file.
//
// Writes incrementally (one line per alert, flushed immediately) rather than
// batching until the end, so nothing is lost if this gets interrupted or hits
// OONI's rate limit partway through a 9+ month range. Re-run with a later
// start date (3rd arg... see below) to resume after a rate-limit stop.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Only used to borrow the real Report schema's defaults (new Report(x) applies
// them at construction time, no save() ever happens) - never written to.
const database = require('../../backend/database');
const mongoose = database.mongoose;
const Report = require('../../backend/models/report');

const OONIChannel = require('../../backend/fetching/channels/ooni');
const { fetchDailyMeasurements } = require('../../backend/fetching/ooniApi');
const {
  normalizeDomainConfig,
  evaluateRollingAlert,
  evaluateRollingDomainAlerts,
} = require('../../backend/fetching/ooniAlerts');
const defaultDomainConfig = require('../../backend/fetching/config/ooni.json');

const START_DATE = process.argv[2] || '2025-12-01';
const END_DATE = process.argv[3] || new Date().toISOString().slice(0, 10);
const ASNS = String(process.argv[4] || '44244,58224')
  .split(/[\s,]+/)
  .filter(Boolean)
  .map(Number);

const OUT_PATH = path.join(__dirname, '..', '..', 'data', 'ooni-alerts-backfill.jsonl');
const REQUEST_DELAY_MS = 500;
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shiftDay(day, offset) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function fetchWithRetry(options) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await fetchDailyMeasurements(options);
      await sleep(REQUEST_DELAY_MS);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === RETRY_DELAYS_MS.length;
      if (error.status !== 429 || isLastAttempt) throw error;
      const waitMs = error.retryAfterSeconds
        ? error.retryAfterSeconds * 1000
        : RETRY_DELAYS_MS[attempt];
      console.error(`Rate limited by OONI, waiting ${Math.round(waitMs / 1000)}s before retrying...`);
      await sleep(waitMs);
    }
  }
}

// Wrap the Date/ObjectId fields this schema actually uses as MongoDB Extended
// JSON so mongoimport creates real BSON types, not plain strings.
function toExtendedJson(doc) {
  const out = { ...doc };
  if (out._id) out._id = { $oid: out._id.toString() };
  for (const field of ['authoredAt', 'fetchedAt', 'storedAt']) {
    if (out[field] instanceof Date) out[field] = { $date: out[field].toISOString() };
  }
  return out;
}

async function main() {
  const domainConfig = normalizeDomainConfig(defaultDomainConfig);
  const channel = new OONIChannel({
    asns: ASNS.join(','),
    domainConfig,
    reportExists: async () => false, // unused directly - guid collisions are handled at import time
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const out = fs.createWriteStream(OUT_PATH, { flags: 'w' });

  let requestCount = 0;
  let alertCount = 0;
  let dayCount = 0;

  for (const asn of ASNS) {
    for (let day = START_DATE; day <= END_DATE; day = shiftDay(day, 1)) {
      dayCount += 1;
      const windowStartDay = shiftDay(day, -1);
      const windowStart = `${windowStartDay}T00:00:00.000Z`;
      const windowEnd = `${day}T00:00:00.000Z`;
      const domainMode = domainConfig.useAllDomains ? 'volume' : 'domains';
      const guid = `ooni:${asn}:${domainMode}:${day}`;

      let alerts;
      if (domainConfig.useAllDomains) {
        const rows = await fetchWithRetry({ asn, since: windowStartDay, until: day });
        requestCount += 1;
        const found = rows.some((row) => Number(row.measurement_count) > 0);
        alerts = evaluateRollingAlert(found, windowStart, windowEnd);
      } else {
        const rows = await fetchWithRetry({
          asn,
          since: windowStartDay,
          until: day,
          axisX: 'domain',
        });
        requestCount += 1;
        alerts = evaluateRollingDomainAlerts(
          rows.map((row) => ({
            domain: row.domain,
            hasMeasurements: Number(row.measurement_count) > 0,
          })),
          domainConfig.domains,
          windowStart,
          windowEnd,
        );
      }

      if (dayCount % 25 === 0) {
        console.log(`...progress: ${day}, AS${asn}, ${requestCount} requests made, ${alertCount} alerts found so far`);
      }

      if (alerts.length === 0) continue;

      const fetchedAt = new Date();
      const post = channel.parse({ asn, alerts, guid, fetchedAt });
      post._sources = [];
      post._media = ['ooni'];
      post.tags = [];
      post.guid = post.guid || post.platformID;
      post.metadata = { rawAPIResponse: post.raw };
      post.storedAt = fetchedAt;

      const doc = new Report(post).toObject({ flattenMaps: true });
      out.write(`${JSON.stringify(toExtendedJson(doc))}\n`);
      alertCount += 1;
      console.log(`Alert: ${guid}`);
    }
  }

  await new Promise((resolve) => out.end(resolve));
  console.log(`\nDone. ${requestCount} API requests, ${alertCount} alert(s) written to ${OUT_PATH}`);
  console.log(`Range covered: ${START_DATE} to ${END_DATE}, ASNs: ${ASNS.join(', ')}`);
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
