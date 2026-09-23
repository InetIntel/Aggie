'use strict';

// Daily measurement counts per watched domain for the days leading up to an
// alert. The series is fetched once when the alert is created and stored on the
// report (metadata.rawAPIResponse.chart), so viewing an alert never calls OONI.

const { fetchDailyMeasurements } = require('./ooniApi');

const SERIES_DAYS = 14;

function shiftDay(day, offset) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// Last UTC day the alert's window covers. A window that ends exactly at
// midnight (historical alerts) covers the day before; a live hourly window that
// ends mid-day covers the current, still partial, day.
function chartEndDay(windowEnd) {
  return new Date(new Date(windowEnd).getTime() - 1).toISOString().slice(0, 10);
}

// Lookup of measurement counts by domain and day, built from aggregation rows
// (axis_x=measurement_start_day, axis_y=domain).
function indexRows(rows, domains) {
  const wanted = new Set(domains);
  const index = new Map();
  for (const row of rows) {
    if (!wanted.has(row.domain)) continue;
    const day = String(row.measurement_start_day).slice(0, 10);
    const key = `${row.domain}|${day}`;
    index.set(key, (index.get(key) || 0) + (Number(row.measurement_count) || 0));
  }
  return index;
}

function seriesFromIndex(index, { endDay, domains, days = SERIES_DAYS }) {
  const from = shiftDay(endDay, -(days - 1));
  const labels = Array.from({ length: days }, (_, i) => shiftDay(from, i));
  const counts = {};
  for (const domain of domains) {
    counts[domain] = labels.map((day) => index.get(`${domain}|${day}`) || 0);
  }
  return { source: 'ooni-aggregation', from, until: endDay, days: labels, domains: counts };
}

function buildSeries({ rows, endDay, domains, days = SERIES_DAYS }) {
  return seriesFromIndex(indexRows(rows, domains), { endDay, domains, days });
}

// One aggregation request covers every domain measured on the network for the
// whole window; only the watched ones are kept.
async function fetchSeries({ asn, endDay, domains, days = SERIES_DAYS, fetchImpl }) {
  const rows = await fetchDailyMeasurements({
    asn,
    since: shiftDay(endDay, -(days - 1)),
    // OONI's until is exclusive.
    until: shiftDay(endDay, 1),
    axisY: 'domain',
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return buildSeries({ rows, endDay, domains, days });
}

module.exports = {
  SERIES_DAYS,
  shiftDay,
  chartEndDay,
  indexRows,
  seriesFromIndex,
  buildSeries,
  fetchSeries,
};
