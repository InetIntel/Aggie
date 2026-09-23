'use strict';

// Rolling 24-hour counts per watched domain for the two weeks leading up to an
// alert. The series is fetched once when the alert is created and stored on the
// report (metadata.rawAPIResponse.chart), so viewing an alert never calls OONI.
//
// The series is 14 blocks of 24 hours, counted back from the alert: the last
// block is the alert's own window, the one before it is the 24 hours before
// that, and so on. OONI's aggregation endpoint has an hourly grain, so the
// blocks are built by adding up 24 hourly buckets. Two limits of that endpoint
// shape this file: since/until must be whole dates (no times), and hourly grain
// is refused for ranges longer than 7 days, so a fortnight takes a few requests.

const { fetchDailyMeasurements } = require('./ooniApi');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SERIES_BLOCKS = 14;
const BLOCK_HOURS = 24;
const MAX_HOURLY_RANGE_DAYS = 7;

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function shiftDay(day, offset) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// The alert's window end rounded down to the hour, since OONI's hourly buckets
// start on the hour. Historical alerts end at midnight, so their blocks are
// whole UTC days.
function chartAnchor(windowEnd) {
  return new Date(Math.floor(new Date(windowEnd).getTime() / HOUR_MS) * HOUR_MS);
}

// The whole dates that hold every hour of the series: sinceDay inclusive,
// untilDay exclusive (OONI's convention).
function seriesRange(anchor, blocks = SERIES_BLOCKS) {
  const anchorMs = anchor.getTime();
  return {
    sinceDay: isoDay(anchorMs - blocks * DAY_MS),
    untilDay: shiftDay(isoDay(anchorMs - HOUR_MS), 1),
  };
}

// Splits [sinceDay, untilDay) into requests OONI will answer at hourly grain.
function dateWindows(sinceDay, untilDay, maxDays = MAX_HOURLY_RANGE_DAYS) {
  const windows = [];
  for (let since = sinceDay; since < untilDay; ) {
    const stop = shiftDay(since, maxDays);
    const until = stop < untilDay ? stop : untilDay;
    windows.push({ since, until });
    since = until;
  }
  return windows;
}

// Lookup of measurement counts by domain and hour, built from aggregation rows
// (axis_x=measurement_start_day, axis_y=domain, time_grain=hour). Pass an
// existing index to add rows from several requests into one.
function indexRows(rows, domains, index = new Map()) {
  const wanted = new Set(domains);
  for (const row of rows) {
    if (!wanted.has(row.domain)) continue;
    const key = `${row.domain}|${Date.parse(row.measurement_start_day)}`;
    index.set(key, (index.get(key) || 0) + (Number(row.measurement_count) || 0));
  }
  return index;
}

function seriesFromIndex(index, { anchor, domains, blocks = SERIES_BLOCKS }) {
  const anchorMs = anchor.getTime();
  const starts = Array.from({ length: blocks }, (_, i) => anchorMs - (blocks - i) * DAY_MS);
  const counts = {};
  for (const domain of domains) {
    counts[domain] = starts.map((start) => {
      let sum = 0;
      for (let h = 0; h < BLOCK_HOURS; h += 1) sum += index.get(`${domain}|${start + h * HOUR_MS}`) || 0;
      return sum;
    });
  }
  return {
    source: 'ooni-aggregation',
    granularity: 'hour',
    blockHours: BLOCK_HOURS,
    from: new Date(starts[0]).toISOString(),
    until: anchor.toISOString(),
    starts: starts.map((ms) => new Date(ms).toISOString()),
    domains: counts,
  };
}

function buildSeries({ rows, anchor, domains, blocks = SERIES_BLOCKS }) {
  return seriesFromIndex(indexRows(rows, domains), { anchor, domains, blocks });
}

// Each request returns a row per domain per hour for every domain OONI measured
// on the network; only the watched ones are kept.
async function fetchSeries({ asn, anchor, domains, blocks = SERIES_BLOCKS, fetchImpl, delayMs = 500 }) {
  const { sinceDay, untilDay } = seriesRange(anchor, blocks);
  const index = new Map();
  const windows = dateWindows(sinceDay, untilDay);
  for (let i = 0; i < windows.length; i += 1) {
    const rows = await fetchDailyMeasurements({
      asn,
      since: windows[i].since,
      until: windows[i].until,
      axisY: 'domain',
      timeGrain: 'hour',
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    indexRows(rows, domains, index);
    if (delayMs && i < windows.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return seriesFromIndex(index, { anchor, domains, blocks });
}

module.exports = {
  HOUR_MS,
  DAY_MS,
  SERIES_BLOCKS,
  BLOCK_HOURS,
  MAX_HOURLY_RANGE_DAYS,
  isoDay,
  shiftDay,
  chartAnchor,
  seriesRange,
  dateWindows,
  indexRows,
  seriesFromIndex,
  buildSeries,
  fetchSeries,
};
