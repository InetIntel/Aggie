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
 * Compute IHR start and ending timebin for past N days data.
 * e.g. on 2026-02-16, to fetch data for past 3 days
 *      timebin_ltd = 2026-02-15T23:59:59Z
 *      timbine_gte = 2026-02-12T23:59:59Z
 */
function computeIhrTimebinRange(days = 3) {
  const now = new Date();

  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1, 
    23, 59, 59
  ));

  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - days);

  const toIsoNoMs = (d) => {
    const iso = d.toISOString(); 
    return iso.split('.')[0] + 'Z';
  };

  return {
    timebin_gte: toIsoNoMs(start),
    timebin_lte: toIsoNoMs(end),
    startDate: start,
    endDate: end,
  };
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

function normalizeWeightscheme(ws) {
  return (ws == null ? '' : String(ws)).toLowerCase();
}

function normalizeTransitonly(v) {

  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (typeof v === 'number') return v !== 0;
  return false;
}

function toNumberOrNull(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function avgFromSumCount(sum, count) {
  if (!count) return null;
  return sum / count;
}


// ---- Fetch IHR data ----
async function fetchIhrAsns(countryCode, timebin_gte, timebin_lte) {
  console.log(`[ASN-INGEST-IHR] Fetching ASN data for country=${countryCode}, timebin_gte=${timebin_gte}, timebin_lte=${timebin_lte}`);

  const params = {
    country: countryCode,
    timebin_gte: timebin_gte,
    timebin_lte: timebin_lte,
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

  const {timebin_gte, timebin_lte, endDate: ihrWindowEndDate} = computeIhrTimebinRange(3);

  const todaysAsns = new Map();

  // ---- 1. IHR ----

  let ihrResults = [];
  try {
    ihrResults = await fetchIhrAsns(country, timebin_gte, timebin_lte);
  } catch (err) {
    console.error('[ASN-INGEST-IHR] Error fetching data:', err.message || err);
  }

  const ihrAgg = new Map(); // de-duplicate ihr asn-level data and aggregate for 3-day average calcualtion
  for (const rec of ihrResults) {
    const num = parseAsnNumber(rec.asn);
    if (num == null) {
      console.warn('[ASN-INGEST-IHR] Skipping record with invalid ASN:', rec.asn);
      continue;
    }

    const asnStr = asnStringFromNumber(num);
    const ws = normalizeWeightscheme(rec.weightscheme);
    const transitonly = normalizeTransitonly(rec.transitonly);

    const recTime = rec.timebin ? new Date(rec.timebin): null;

    let agg = ihrAgg.get(asnStr);
    if (!agg) {
      agg = {
        asn: asnStr,
        number: num,
        name: null,
        country: null,
        source: 'IHR',
        lastestRecTime: null,
        latestRaw: null,

        popTotalSum: 0, 
        popTotalCnt: 0,
        popDirectSum: 0, 
        popDirectCnt: 0,
        popIndirectSum: 0, 
        popIndirectCnt: 0,
        asTotalSum: 0, 
        asTotalCnt: 0,
      }
      ihrAgg.set(asnStr, agg);
    }

    // update document fields & calculate averages
    if (!agg.name && typeof rec.asn_name === 'string' ){
      agg.name = rec.asn_name.trim();
    }

    if (!agg.country) {
      const recCountry = (rec.country || counry || '').toLowerCase();
      agg.country = recCountry || null;
    }

    if (recTime instanceof Date && !Number.isNaN(recTime.getTime())){
      if (!agg.lastestRecTime || recTime > agg.lastestRecTime) {
        agg.lastestRecTime = recTime;
        agg.latestRaw = rec;
      }
    } else if (!agg.latestRaw){
      agg.latestRaw = rec;
    }

    if (ws === "eyeball"){
      const hege = toNumberOrNull(rec.hege);
      let weight = toNumberOrNull(rec.weight);
      if (weight != null) {
        weight = weight / 100.0;  // the API data gives weight in 1% unit
      }

      if (transitonly === false && hege != null) {
        agg.popTotalSum += hege; 
        agg.popTotalCnt += 1;  
      } else if (transitonly === true && hege != null) {
        agg.popIndirectSum += hege; 
        agg.popIndirectCnt += 1;     
      }

      if (weight != null) {
        agg.popDirectSum += weight;
        agg.popDirectCnt += 1;
      }

    } else if (ws === "as") {
      if (transitonly === false){
        const hege = toNumberOrNull(rec.hege);
        agg.asTotalSum += hege;
        agg.asTotalCnt += 1;
      }
    }

  }

  for (const agg of ihrAgg.values()) {
    const normalized = {
      asn: agg.asn,
      number: agg.number,
      name: agg.name,
      country: agg.country,
      source: 'IHR',
      raw: agg.latestRaw, 
      
      populationCoverageTotal: avgFromSumCount(agg.popTotalSum, agg.popTotalCnt),
      populationCoverageDirect: avgFromSumCount(agg.popDirectSum, agg.popDirectCnt),
      populationCoverageIndirect: avgFromSumCount(agg.popIndirectSum, agg.popIndirectCnt),
      asCoverageTotal: avgFromSumCount(agg.asTotalSum, agg.asTotalCnt),

      snapshotDate: ihrWindowEndDate,
    };

    todaysAsns.set(agg.asn, normalized);
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

      populationCoverageTotal: null,
      populationCoverageDirect: null,
      populationCoverageIndirect: null,
      asCoverageTotal: null,

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

      populationCoverageTotal: rec.populationCoverageTotal,
      populationCoverageDirect: rec.populationCoverageDirect,
      populationCoverageIndirect: rec.populationCoverageIndirect,
      asCoverageTotal: rec.asCoverageTotal,
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

        populationCoverageTotal: rec.populationCoverageTotal,
        populationCoverageDirect: rec.populationCoverageDirect,
        populationCoverageIndirect: rec.populationCoverageIndirect,
        asCoverageTotal: rec.asCoverageTotal,
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