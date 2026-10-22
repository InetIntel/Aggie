const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AGGREGATION_URL,
  MEASUREMENTS_URL,
  hasMeasurements,
  fetchDailyMeasurements,
} = require('./ooniApi');

test('checks measurement existence in an exact rolling window', async () => {
  let requestedUrl;
  const result = await hasMeasurements({
    asn: 44244,
    domain: 'telegram.org',
    since: '2026-08-13T12:30:00.000Z',
    until: '2026-08-14T12:30:00.000Z',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ results: [{ measurement_uid: 'id' }] }) };
    },
  });

  assert.equal(`${requestedUrl.origin}${requestedUrl.pathname}`, MEASUREMENTS_URL);
  assert.equal(requestedUrl.searchParams.get('probe_cc'), 'IR');
  assert.equal(requestedUrl.searchParams.get('probe_asn'), 'AS44244');
  assert.equal(requestedUrl.searchParams.get('test_name'), 'web_connectivity');
  assert.equal(requestedUrl.searchParams.get('domain'), 'telegram.org');
  assert.equal(requestedUrl.searchParams.get('since'), '2026-08-13T12:30:00.000Z');
  assert.equal(requestedUrl.searchParams.get('until'), '2026-08-14T12:30:00.000Z');
  assert.equal(requestedUrl.searchParams.get('limit'), '1');
  assert.equal(result, true);
});

test('requests Iran web connectivity measurements grouped by day', async () => {
  let requestedUrl;
  const result = await fetchDailyMeasurements({
    asn: 44244,
    since: '2026-08-10',
    until: '2026-08-11',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        json: async () => ({ result: { measurement_count: 12 } }),
      };
    },
  });

  assert.equal(`${requestedUrl.origin}${requestedUrl.pathname}`, AGGREGATION_URL);
  assert.equal(requestedUrl.searchParams.get('probe_cc'), 'IR');
  assert.equal(requestedUrl.searchParams.get('probe_asn'), '44244');
  assert.equal(requestedUrl.searchParams.get('test_name'), 'web_connectivity');
  assert.equal(requestedUrl.searchParams.get('axis_x'), 'measurement_start_day');
  assert.equal(requestedUrl.searchParams.get('since'), '2026-08-10');
  assert.equal(requestedUrl.searchParams.get('until'), '2026-08-11');
  assert.deepEqual(result, [{ measurement_count: 12 }]);
});

test('throws when the OONI aggregation request fails', async () => {
  await assert.rejects(
    fetchDailyMeasurements({
      asn: 44244,
      since: '2026-08-10',
      until: '2026-08-11',
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /OONI aggregation request failed \(503\)/,
  );
});

test('supports grouping measurements by domain', async () => {
  let requestedUrl;
  await fetchDailyMeasurements({
    asn: 44244,
    since: '2026-08-10',
    until: '2026-08-11',
    axisX: 'domain',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ result: [] }) };
    },
  });

  assert.equal(requestedUrl.searchParams.get('axis_x'), 'domain');
});