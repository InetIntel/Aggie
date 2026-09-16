'use strict';

/**
 * Backfill Cloudflare traffic anomaly reports for a past date range.
 *
 * The live channel only looks back 6 hours with a global `limit`, so anomalies from
 * before a source existed (or from fetcher downtime) are never fetched. This pages
 * through the whole range in day-sized windows, keeps the same country match as the
 * channel, and builds reports with the channel's own parseEvent so they match live ones.
 *
 * Idempotent: anomalies whose guid is already saved are skipped.
 *
 * Usage:
 *   node backend/scripts/backfill-cloudflare-reports.js --from 2026-01-01 --to 2026-03-15 [--source <sourceId>] [--use-location] [--dry-run]
 *
 *   --source        Only backfill this Cloudflare source (default: every Cloudflare source).
 *   --use-location  Pass `location=<countryCode>` to Cloudflare instead of paging through
 *                   every country's anomalies and filtering locally. Faster, but may not
 *                   return the same set (e.g. ASN anomalies), so compare both if unsure.
 *   --dry-run       Fetch and report counts without writing.
 */

require('dotenv').config();

const database = require('../database'); // connects on require
const Source = require('../models/source');
require('../models/credentials'); // registers the Credentials schema for populate
const Report = require('../models/report');
const CloudflareChannel = require('../fetching/channels/cloudflare');
const { decryptSecretsObject } = require('../fetching/utils/decryption');
const { API_BASE_URLS, API_ROUTES } = require('../config/fetching/externalApis');

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES_PER_WINDOW = 100;

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const DRY_RUN = process.argv.includes('--dry-run');
const USE_LOCATION = process.argv.includes('--use-location');
const FROM = getArg('--from');
const TO = getArg('--to');
const SOURCE_ID = getArg('--source');

const toApiTimestamp = (date) => date.toISOString().split('.')[0] + 'Z';

async function fetchWindow({ apiToken, dateStart, dateEnd, countryCode }) {
  const events = [];
  const seen = new Set();

  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
    const url = new URL(API_ROUTES.CLOUDFLARE.TRAFFIC_ANOMALIES, API_BASE_URLS.CLOUDFLARE);
    url.searchParams.append('dateStart', toApiTimestamp(dateStart));
    url.searchParams.append('dateEnd', toApiTimestamp(dateEnd));
    url.searchParams.append('limit', PAGE_SIZE);
    url.searchParams.append('offset', page * PAGE_SIZE);
    if (USE_LOCATION) url.searchParams.append('location', countryCode);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
    if (!res.ok) throw new Error(`Failed fetching ${url} - ${res.status}: ${await res.text()}`);

    const body = await res.json();
    const batch = body?.result?.trafficAnomalies;
    if (!body.success || !Array.isArray(batch)) {
      throw new Error(`Failed parsing traffic anomalies from ${url}: ${JSON.stringify(body.errors)}`);
    }

    // Stop if offset is ignored and the same page comes back again.
    const fresh = batch.filter((e) => e.uuid && !seen.has(e.uuid));
    fresh.forEach((e) => seen.add(e.uuid));
    events.push(...fresh);

    if (batch.length < PAGE_SIZE || fresh.length === 0) break;
  }

  return events;
}

async function backfillSource(source, from, to) {
  const countryCode = source.keywords;
  const secrets = source.credentials?.secrets ? decryptSecretsObject(source.credentials.secrets) : {};
  const apiToken = secrets?.cloudflareApiToken;

  if (!apiToken) {
    console.error(`[backfill-cloudflare] Skipped source ${source._id} (${source.nickname}): no Cloudflare API token.`);
    return;
  }

  // Only used for parseEvent; never registered with downstream or started.
  const channel = new CloudflareChannel({
    media: source.media,
    countryCode,
    credentials: source.credentials,
    sourceId: source._id,
  });

  let fetched = 0;
  let matched = 0;
  let created = 0;
  let existing = 0;
  // Cloudflare returns an anomaly in every window it overlaps, not just the one it started in.
  const seenGuids = new Set();

  for (let start = from.getTime(); start < to.getTime(); start += DAY_MS) {
    const dateStart = new Date(start);
    const dateEnd = new Date(Math.min(start + DAY_MS, to.getTime()));
    const events = await fetchWindow({ apiToken, dateStart, dateEnd, countryCode });
    fetched += events.length;

    for (const event of events) {
      const matchesLocation = event.locationDetails?.code === countryCode;
      const matchesAsnLocation = event.asnDetails?.location?.code === countryCode;
      if (!matchesLocation && !matchesAsnLocation) continue;
      matched += 1;

      const post = channel.parseEvent(event, matchesLocation);
      if (!post || seenGuids.has(post.platformID)) continue;
      seenGuids.add(post.platformID);

      if (await Report.exists({ guid: post.platformID })) {
        existing += 1;
        continue;
      }

      // Mirrors postToReport for cloudflare posts.
      const report = {
        authoredAt: post.authoredAt,
        fetchedAt: new Date(),
        author: post.author,
        content: post.content,
        url: post.url,
        guid: post.platformID,
        _sources: [String(source._id)],
        _media: [post.platform],
        tags: source.tags,
        metadata: { rawAPIResponse: post.raw },
        isOutageEvent: post.isOutageEvent,
        isAsnScoped: post.isAsnScoped,
        isOutageOngoing: post.isOutageOngoing,
        eventAggKeyBase: post.eventAggKeyBase,
        eventIdentifier: post.eventIdentifier,
        ...(post.asn !== null && { asn: post.asn }),
        ...(post.outageStartedAt !== null && { outageStartedAt: post.outageStartedAt }),
        ...(post.outageEndedAt !== null && { outageEndedAt: post.outageEndedAt }),
        ...(post.geoScope !== null && { geoScope: post.geoScope }),
      };

      console.log(`  ${DRY_RUN ? '[dry-run] would create' : 'create'} ${post.raw.entityLevel.padEnd(7)} ${post.raw.started} -> ${post.raw.ended} ${post.author}`);
      if (!DRY_RUN) await Report.create(report);
      created += 1;
    }
  }

  console.log(`[backfill-cloudflare] Source ${source.nickname} (${countryCode}): fetched ${fetched}, matched country ${matched}, ${DRY_RUN ? 'would create' : 'created'} ${created}, already saved ${existing}.`);
}

async function main() {
  if (!FROM || !TO) throw new Error('--from and --to are required (e.g. --from 2026-01-01 --to 2026-03-15).');

  const from = new Date(FROM);
  const to = new Date(TO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new Error(`Invalid date range: ${FROM} to ${TO}.`);
  }

  const { connection } = database.mongoose;
  if (connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      connection.once('open', resolve);
      connection.once('error', reject);
    });
  }

  const filter = { media: 'cloudflare', ...(SOURCE_ID && { _id: SOURCE_ID }) };
  const sources = await Source.find(filter).populate({ path: 'credentials' }).exec();
  if (!sources.length) throw new Error(`No Cloudflare sources found for ${JSON.stringify(filter)}.`);

  for (const source of sources) {
    await backfillSource(source, from, to);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[backfill-cloudflare] Failed - ${err.message}`);
    process.exit(1);
  });
