'use strict';

// Backfills Cloudflare anomalies missed after the last stored alert (2026-06-26).
// Dry run unless --apply is passed.
//
//   node backend/scripts/backfill-cloudflare-anomalies-2026-06-27_to_2026-10-19.js --source-id=<id> [--apply]
//
// Optional: --since, --until, --country. The token comes from CLOUDFLARE_API_TOKEN
// or, if that is not set, from the source's stored credential.

require('dotenv').config();

require('../database');
require('../models/credentials');
const Report = require('../models/report');
const Source = require('../models/source');
const CloudflareChannel = require('../fetching/channels/cloudflare');
const { decryptSecretsObject } = require('../fetching/utils/decryption');
const { API_BASE_URLS, API_ROUTES } = require('../config/fetching/externalApis');

const PAGE_SIZE = 100;

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};

const apply = process.argv.includes('--apply');
const since = new Date(arg('since') || '2026-06-27');
const until = new Date(Math.min(Date.parse(arg('until') || '2026-10-19T23:59:59Z'), Date.now()));
const sourceId = arg('source-id');

const apiTime = (d) => d.toISOString().split('.')[0] + 'Z';

async function fetchAnomalies(token) {
  const anomalies = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(API_ROUTES.CLOUDFLARE.TRAFFIC_ANOMALIES, API_BASE_URLS.CLOUDFLARE);
    url.searchParams.append('dateStart', apiTime(since));
    url.searchParams.append('dateEnd', apiTime(until));
    url.searchParams.append('limit', PAGE_SIZE);
    url.searchParams.append('offset', offset);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Cloudflare returned ${res.status}`);

    const body = await res.json();
    if (!body.success || !body.result || !Array.isArray(body.result.trafficAnomalies)) {
      throw new Error(`Unexpected response: ${JSON.stringify(body.errors)}`);
    }

    anomalies.push(...body.result.trafficAnomalies);
    if (body.result.trafficAnomalies.length < PAGE_SIZE) return anomalies;
  }
}

const alreadyStored = (post) =>
  Report.exists({
    $or: [
      { guid: post.platformID },
      { eventIdentifier: post.eventIdentifier },
      { _media: 'cloudflare', asn: post.asn || null, outageStartedAt: post.outageStartedAt },
    ],
  });

async function main() {
  if (!sourceId) throw new Error('--source-id is required');

  const source = await Source.findById(sourceId).populate({ path: 'credentials' }).exec();
  if (!source || source.media !== 'cloudflare') throw new Error(`${sourceId} is not a cloudflare source`);

  const country = arg('country') || source.keywords || 'IR';

  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token && source.credentials && source.credentials.secrets) {
    token = decryptSecretsObject(source.credentials.secrets).cloudflareApiToken;
  }
  if (!token) throw new Error('No API token found');

  console.log(`Fetching ${country} anomalies from ${apiTime(since)} to ${apiTime(until)}${apply ? '' : ' (dry run)'}`);
  const anomalies = await fetchAnomalies(token);

  const channel = new CloudflareChannel({ media: 'cloudflare', countryCode: country });
  const posts = [];
  const seen = new Set();

  for (const event of anomalies) {
    const inCountry = event.locationDetails && event.locationDetails.code === country;
    const inAsnCountry = event.asnDetails && event.asnDetails.location && event.asnDetails.location.code === country;
    if (!inCountry && !inAsnCountry) continue;

    const post = channel.parseEvent(event, inCountry);
    if (!post || seen.has(post.platformID)) continue;

    seen.add(post.platformID);
    posts.push(post);
  }
  posts.sort((a, b) => a.outageStartedAt - b.outageStartedAt);

  let saved = 0;
  let skipped = 0;

  for (const post of posts) {
    const label = `${post.outageStartedAt.toISOString()}  ${post.asn || 'country'}  ${post.platformID}`;

    if (await alreadyStored(post)) {
      console.log(`  skip  ${label}`);
      skipped += 1;
      continue;
    }

    console.log(`  save  ${label}`);
    if (!apply) continue;

    await Report.create({
      ...post,
      fetchedAt: new Date(),
      _sources: [String(source._id)],
      _media: ['cloudflare'],
      tags: source.tags || [],
      guid: post.platformID,
      metadata: { rawAPIResponse: post.raw },
    });
    saved += 1;
  }

  console.log(`${anomalies.length} anomalies worldwide, ${posts.length} for ${country}, ${skipped} already stored.`);
  console.log(apply ? `Saved ${saved}.` : 'Dry run, nothing written.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  });
