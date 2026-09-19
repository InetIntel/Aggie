'use strict';
const { fetchDailyMeasurements } = require('../../fetching/ooniApi');
const { normalizeDomainConfig } = require('../../fetching/ooniAlerts');
const domainConfig = require('../../fetching/config/ooni.json');

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = 14;
const ALLOWED_ASNS = new Set([44244, 58224]);
const CACHE_TTL_MS = 60 * 60 * 1000;

// OONI's public API is rate limited per IP, and there are only a couple of
// watched networks, so keep each (asn, end day) result for an hour instead of
// calling out every time an alert is opened.
const cache = new Map();

function shiftDay(day, offset) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// GET /api/ooni/series?asn=44244&until=2026-09-15
// Returns, for each watched domain, its measurement count per day for the DAYS
// days ending on `until`. Shape: { days: [...], domains: { <domain>: [counts] } }.
// One OONI request covers every domain; only the watched ones are kept.
exports.ooni_series = async (req, res) => {
  const asn = Number(req.query.asn);
  const until = String(req.query.until || '');
  if (!ALLOWED_ASNS.has(asn) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return res.status(400).send('asn and until (YYYY-MM-DD) are required');
  }

  const key = `${asn}:${until}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json(hit.data);

  try {
    // OONI's `until` is exclusive, so ask for the day after to include `until`.
    const since = shiftDay(until, -(DAYS - 1));
    const rows = await fetchDailyMeasurements({
      asn,
      since,
      until: shiftDay(until, 1),
      axisY: 'domain',
    });
    const days = [];
    for (let i = 0; i < DAYS; i += 1) days.push(shiftDay(since, i));
    const dayIndex = new Map(days.map((day, i) => [day, i]));
    const watched = normalizeDomainConfig(domainConfig).domains;
    const domains = Object.fromEntries(watched.map((d) => [d, new Array(DAYS).fill(0)]));
    for (const row of rows) {
      const series = domains[row.domain];
      const i = dayIndex.get(String(row.measurement_start_day).slice(0, 10));
      if (series && i !== undefined) series[i] += Number(row.measurement_count) || 0;
    }
    const data = { asn, since, until, days, domains };
    cache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('OONI series fetch failed:', err.message);
    res.status(err.status === 429 ? 429 : 502).send('Could not load OONI data');
  }
};
