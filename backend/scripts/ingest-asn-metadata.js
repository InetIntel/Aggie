'use strict';

require('dotenv').config();

const axios = require('axios');
const database = require('../database'); // assumes this connects on require
const AsnInfo = require('../models/asnInfo');
const AsnDailyStats = require('../models/asnDailyStats');
const { stringify } = require('querystring');



const ASN_QUERY_COUNTRY = (process.env.asnQueryCountry || 'US');

// IHR endpoint (full URL)
const IHR_HEGEMONY_URL = 'https://www.ihr.live/ihr/api/hegemony/countries';

// RIPEstat base URL
const RIPE_BASE_URL = 'https://stat.ripe.net';

// ---- Helpers ----

/**
 * Compute IHR timebin for "one day before current fetch date" at 00:00:00Z.
 */
function computeIhrTimebin() {
  const now = new Date();

  const todayUtcMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  // Set as One day before
  todayUtcMidnight.setUTCDate(todayUtcMidnight.getUTCDate() - 1);

  const iso = todayUtcMidnight.toISOString(); // e.g. "2025-11-29T00:00:00.000Z"
  const withoutMs = iso.split('.')[0] + 'Z';
  return withoutMs;
}

function asnStringFromNumber(num) {
  return 'as' + num;
}

/**
 * Parse a possibly string ASN number to integer.
 */
function parseAsnNumber(asnStr) {
  const n = parseInt(asnStr, 10);
  if (Number.isNaN(n)) return null;
  return n;
}


// ---- Fetch IHR data ----
async function fetchIhrAsns(countryCode, timebin) {
  console.log(`[ASN-INGEST-IHR] Fetching ASN data for country=${countryCode}, timebin=${timebin}`);

  const params = {
    country: countryCode,
    timebin,
  };

  const { data } = await axios.get(IHR_HEGEMONY_URL, { params });

  const results = data && data.results;
  if (!Array.isArray(results)) {
    console.warn('[ASN-INGEST-IHR] Unexpected response format, "result" is not an array');
    return [];
  }

  return results;
}


// ---- Fetch RIPE country ASN list ----
async function fetchRipeCountryAsns(countryCode) {
  console.log(`[ASN-INGEST-RIPE] Fetching country-resource-list for country=${countryCode}`);

  const url = `${RIPE_BASE_URL}/data/country-resource-list/data.json`;
  const params = { resource: countryCode }; 

  const { data } = await axios.get(url, { params });

  const payload = data && data.data;
  if (!payload) {
    console.warn('[ASN-INGEST-RIPE] No "data" field in response');
    return { queryTime: null, apiTime: data && data.time, asnList: [] };
  }

  const queryTime = payload.query_time ? new Date(payload.query_time) : null;
  const asnList = (payload.sources && payload.sources.asn) || [];

  const apiTime = data.time ? new Date(data.time) : null;

  return {
    queryTime,
    apiTime,
    asnList,
    raw: data,
  };
}


// ---- Fetch RIPE as-overview for a single ASN ----
async function fetchRipeAsOverview(asnNumber) {
  const url = `${RIPE_BASE_URL}/data/as-overview/data.json`;
  const params = { resource: `AS${asnNumber}` };

  const { data } = await axios.get(url, { params });

  return data; 
}


// ---- Main ingestion logic ----
async function ingestAsnMetadata() {
  const now = new Date();
  const country = ASN_QUERY_COUNTRY;

  console.log(`[ASN-INGEST] Starting ingestion for country=${country} at ${now.toISOString()}`);

  const ihrTimebin = computeIhrTimebin();

  const todaysAsns = new Map();

  // ---- 1. IHR ----

  let ihrResults = [];
  try {
    ihrResults = await fetchIhrAsns(country, ihrTimebin);
  } catch (err) {
    console.error('[ASN-INGEST-IHR] Error fetching data:', err.message || err);
  }

  for (const rec of ihrResults) {
    const num = parseAsnNumber(rec.asn);
    if (num == null) {
      console.warn('[ASN-INGEST-IHR] Skipping record with invalid ASN:', rec.asn);
      continue;
    }

    const asnStr = asnStringFromNumber(num);
    if (todaysAsns.has(asnStr)) {
      continue;
    }

    // timebin is snapshot date for AsnDailyStats
    const snapshotDate = rec.timebin ? new Date(rec.timebin) : null;
    const name = typeof rec.asn_name === 'string' ? rec.asn_name.trim() : null;
    const recCountry = (rec.country || country || '').toLowerCase();

    const normalized = {
      asn: asnStr,
      number: num,
      name,
      country: recCountry,
      source: 'IHR',
      raw: rec,
      snapshotDate,
    };

    todaysAsns.set(asnStr, normalized);
  }

  console.log(`[ASN-INGEST] IHR provided ${todaysAsns.size} unique ASNs`);

  // ---- 2. RIPE ----
  let ripeCountryData;
  try {
    ripeCountryData = await fetchRipeCountryAsns(country);
  } catch (err) {
    console.error('[ASN-INGEST-RIPE] Error fetching country-resource-list:', err.message || err);
    ripeCountryData = { queryTime: null, apiTime: null, asnList: [], raw: null };
  }

  const { queryTime, asnList } = ripeCountryData;

  const ripeSnapshotDate = queryTime;

  for (const asnStrRaw of asnList) {
    const num = parseAsnNumber(asnStrRaw);
    if (num == null) {
      console.warn('[ASN-INGEST-RIPE] Skipping invalid ASN in list:', asnStrRaw);
      continue;
    }

    const asnStr = asnStringFromNumber(num);

    if (todaysAsns.has(asnStr)) continue;

    // Fetch as-overview to get name & detailed raw data
    let overview;
    try {
      overview = await fetchRipeAsOverview(num);
    } catch (err) {
      console.error(`[ASN-INGEST-RIPE] Error fetching as-overview for AS${num}:`, err.message || err);
      continue;
    }

    const block = overview && overview.data && overview.data.block;
    const name = block && typeof block.name === 'string' ? block.name.trim() : null;

    const normalized = {
      asn: asnStr,
      number: num,
      name,
      country, 
      source: 'ripe',
      raw: overview,
      snapshotDate: ripeSnapshotDate,
    };

    todaysAsns.set(asnStr, normalized);
  }

  console.log(`[ASN-INGEST] After RIPE fill, total ASNs for today: ${todaysAsns.size}`);


  // ---- 3. Persist into AsnInfo + AsnDailyStats Model ----
  const updates = [];

  for (const rec of todaysAsns.values()) {

    const infoPayload = {
      asn: rec.asn,
      number: rec.number,
      name: rec.name,
      country: rec.country,
      source: rec.source,
      raw: rec.raw,
    };

    const infoPromise = AsnInfo.upsertFromIngestion(infoPayload);

    let statsPromise = Promise.resolve();
    if (rec.snapshotDate instanceof Date && !Number.isNaN(rec.snapshotDate.getTime())) {
      statsPromise = AsnDailyStats.upsertDailyStats({
        asn: rec.asn,
        snapshotDate: rec.snapshotDate,
        number: rec.number,
        name: rec.name,
        country: rec.country,
        source: rec.source,
        raw: rec.raw,
      });
    }

    updates.push(Promise.all([infoPromise, statsPromise]));
  }

  await Promise.all(updates);

  console.log(
    `[ASN-INGEST] Successfully upserted ${todaysAsns.size} ASNs into AsnInfo and AsnDailyStats`
  );
}

async function main() {
  try {
    await ingestAsnMetadata();
  } catch (err) {
    console.error('[ASN-INGEST] Ingestion failed, error:', err);
  } finally {
    if (database.mongoose && database.mongoose.connection) {
      await database.mongoose.connection.close();
    }
  }
}

if (require.main === module) {
  main();
}