const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chartAnchor,
  seriesRange,
  dateWindows,
  buildSeries,
  fetchSeries,
} = require('./ooniSeries');

const hourRow = (domain, iso, count) => ({
  domain,
  measurement_start_day: iso,
  measurement_count: count,
});

test('chartAnchor rounds the window end down to the hour', () => {
  assert.equal(chartAnchor('2026-09-15T14:30:00.000Z').toISOString(), '2026-09-15T14:00:00.000Z');
  assert.equal(chartAnchor('2026-09-15T00:00:00.000Z').toISOString(), '2026-09-15T00:00:00.000Z');
  assert.equal(chartAnchor('2026-09-15T23:59:59.999Z').toISOString(), '2026-09-15T23:00:00.000Z');
});

test('seriesRange covers 14 x 24 hours back from the anchor, in whole dates', () => {
  assert.deepEqual(seriesRange(new Date('2026-09-15T14:00:00.000Z')), {
    sinceDay: '2026-09-01',
    untilDay: '2026-09-16',
  });
  // Ending exactly at midnight, the last hour is the previous day's 23:00.
  assert.deepEqual(seriesRange(new Date('2026-09-15T00:00:00.000Z')), {
    sinceDay: '2026-09-01',
    untilDay: '2026-09-15',
  });
});

test('dateWindows never asks for more than 7 days at hourly grain', () => {
  assert.deepEqual(dateWindows('2026-09-01', '2026-09-16'), [
    { since: '2026-09-01', until: '2026-09-08' },
    { since: '2026-09-08', until: '2026-09-15' },
    { since: '2026-09-15', until: '2026-09-16' },
  ]);
  assert.deepEqual(dateWindows('2026-09-01', '2026-09-04'), [{ since: '2026-09-01', until: '2026-09-04' }]);
});

test('buildSeries adds up hourly rows into 24-hour blocks counted back from the anchor', () => {
  const anchor = new Date('2026-09-15T14:00:00.000Z');
  const series = buildSeries({
    rows: [
      // last block: 2026-09-14T14:00 up to (not including) 2026-09-15T14:00
      hourRow('a.example', '2026-09-14T14:00:00Z', 2),
      hourRow('a.example', '2026-09-15T13:00:00Z', 3),
      // the block before it
      hourRow('a.example', '2026-09-14T13:00:00Z', 7),
      // at or after the anchor: not part of any block
      hourRow('a.example', '2026-09-15T14:00:00Z', 50),
      hourRow('unwatched.example', '2026-09-15T13:00:00Z', 99),
    ],
    anchor,
    domains: ['a.example', 'b.example'],
  });

  assert.equal(series.starts.length, 14);
  assert.equal(series.starts[13], '2026-09-14T14:00:00.000Z');
  assert.equal(series.starts[12], '2026-09-13T14:00:00.000Z');
  assert.equal(series.from, series.starts[0]);
  assert.equal(series.until, '2026-09-15T14:00:00.000Z');
  assert.equal(series.blockHours, 24);
  assert.equal(series.granularity, 'hour');
  assert.equal(series.domains['a.example'][13], 5);
  assert.equal(series.domains['a.example'][12], 7);
  assert.equal(series.domains['a.example'].reduce((a, b) => a + b, 0), 12);
  assert.deepEqual(series.domains['b.example'], new Array(14).fill(0));
  assert.equal(series.domains['unwatched.example'], undefined);
});

test('a midnight anchor gives whole UTC days', () => {
  const series = buildSeries({
    rows: [hourRow('a.example', '2026-09-14T09:00:00Z', 4), hourRow('a.example', '2026-09-14T23:00:00Z', 1)],
    anchor: new Date('2026-09-15T00:00:00.000Z'),
    domains: ['a.example'],
  });
  assert.equal(series.starts[13], '2026-09-14T00:00:00.000Z');
  assert.equal(series.domains['a.example'][13], 5);
});

test('fetchSeries asks OONI hourly, in windows of at most 7 days, and combines them', async () => {
  const urls = [];
  const series = await fetchSeries({
    asn: 44244,
    anchor: new Date('2026-09-15T14:00:00.000Z'),
    domains: ['a.example'],
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = new URL(url);
      urls.push(u);
      const since = u.searchParams.get('since');
      const rows = since === '2026-09-15' ? [hourRow('a.example', '2026-09-15T13:00:00Z', 6)] : [];
      return { ok: true, json: async () => ({ result: rows }) };
    },
  });

  assert.equal(urls.length, 3);
  for (const u of urls) {
    assert.equal(u.searchParams.get('probe_asn'), '44244');
    assert.equal(u.searchParams.get('axis_y'), 'domain');
    assert.equal(u.searchParams.get('time_grain'), 'hour');
  }
  assert.deepEqual(urls.map((u) => [u.searchParams.get('since'), u.searchParams.get('until')]), [
    ['2026-09-01', '2026-09-08'],
    ['2026-09-08', '2026-09-15'],
    ['2026-09-15', '2026-09-16'],
  ]);
  assert.equal(series.domains['a.example'][13], 6);
});
