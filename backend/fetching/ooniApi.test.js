const test = require('node:test');
const assert = require('node:assert/strict');
const { AGGREGATION_URL, fetchDailyMeasurements } = require('./ooniApi');

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