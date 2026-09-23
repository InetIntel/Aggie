const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chartEndDay,
  shiftDay,
  buildSeries,
  fetchSeries,
} = require('./ooniSeries');

const row = (domain, day, count) => ({
  domain,
  measurement_start_day: `${day}T00:00:00Z`,
  measurement_count: count,
});

test('chartEndDay uses the previous day for a midnight window and the same day otherwise', () => {
  assert.equal(chartEndDay('2026-09-15T00:00:00.000Z'), '2026-09-14');
  assert.equal(chartEndDay('2026-09-15T14:30:00.000Z'), '2026-09-15');
  assert.equal(chartEndDay('2026-09-15T23:59:59.999Z'), '2026-09-15');
});

test('shiftDay crosses month and year boundaries', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
});

test('buildSeries returns one count per day for each watched domain, zero when missing', () => {
  const series = buildSeries({
    rows: [
      row('a.example', '2026-09-13', 4),
      row('a.example', '2026-09-14', 7),
      row('unwatched.example', '2026-09-14', 99),
    ],
    endDay: '2026-09-14',
    domains: ['a.example', 'b.example'],
    days: 3,
  });

  assert.deepEqual(series.days, ['2026-09-12', '2026-09-13', '2026-09-14']);
  assert.equal(series.from, '2026-09-12');
  assert.equal(series.until, '2026-09-14');
  assert.deepEqual(series.domains, {
    'a.example': [0, 4, 7],
    'b.example': [0, 0, 0],
  });
});

test('buildSeries adds up rows that repeat for the same domain and day', () => {
  const series = buildSeries({
    rows: [row('a.example', '2026-09-14', 2), row('a.example', '2026-09-14', 3)],
    endDay: '2026-09-14',
    domains: ['a.example'],
    days: 1,
  });
  assert.deepEqual(series.domains['a.example'], [5]);
});

test('fetchSeries asks OONI for the 14 days ending on endDay, grouped by domain', async () => {
  const urls = [];
  const series = await fetchSeries({
    asn: 44244,
    endDay: '2026-09-14',
    domains: ['a.example'],
    fetchImpl: async (url) => {
      urls.push(new URL(url));
      return { ok: true, json: async () => ({ result: [row('a.example', '2026-09-14', 6)] }) };
    },
  });

  const params = urls[0].searchParams;
  assert.equal(params.get('probe_asn'), '44244');
  assert.equal(params.get('axis_x'), 'measurement_start_day');
  assert.equal(params.get('axis_y'), 'domain');
  assert.equal(params.get('since'), '2026-09-01');
  assert.equal(params.get('until'), '2026-09-15');
  assert.equal(series.days.length, 14);
  assert.equal(series.domains['a.example'][13], 6);
});
