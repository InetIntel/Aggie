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
      retries: 0,
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
const okResponse = (body) => ({ ok: true, json: async () => body });
const window = { asn: 44244, since: '2026-08-13T12:30:00.000Z', until: '2026-08-14T12:30:00.000Z' };

test('retries a 5xx answer and uses the later success', async () => {
  const statuses = [504, 502];
  const sleeps = [];
  const result = await hasMeasurements({
    ...window,
    sleep: async (ms) => sleeps.push(ms),
    fetchImpl: async () => (statuses.length ? { ok: false, status: statuses.shift() } : okResponse({ results: [{}] })),
  });

  assert.equal(result, true);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('waits as long as Retry-After asks when OONI answers 429', async () => {
  const sleeps = [];
  let calls = 0;
  await hasMeasurements({
    ...window,
    sleep: async (ms) => sleeps.push(ms),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 429, headers: { get: () => '7' } }
        : okResponse({ results: [] });
    },
  });

  assert.deepEqual(sleeps, [7000]);
});

test('gives up after the retries are used and reports the last status', async () => {
  let calls = 0;
  await assert.rejects(
    hasMeasurements({
      ...window,
      retries: 2,
      sleep: async () => {},
      fetchImpl: async () => { calls += 1; return { ok: false, status: 500 }; },
    }),
    /OONI measurements request failed \(500\)/,
  );
  assert.equal(calls, 3);
});

test('does not retry an answer that retrying cannot fix', async () => {
  let calls = 0;
  await assert.rejects(
    hasMeasurements({
      ...window,
      sleep: async () => {},
      fetchImpl: async () => { calls += 1; return { ok: false, status: 404 }; },
    }),
    /\(404\)/,
  );
  assert.equal(calls, 1);
});

test('a network failure or timeout is retried and reported by cause', async () => {
  let calls = 0;
  await assert.rejects(
    hasMeasurements({
      ...window,
      retries: 1,
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
      },
    }),
    /OONI measurements request failed \(timeout\)/,
  );
  assert.equal(calls, 2);
});

test('sends a timeout signal with every request', async () => {
  let signal;
  await hasMeasurements({
    ...window,
    fetchImpl: async (_url, options) => { signal = options.signal; return okResponse({ results: [] }); },
  });
  assert.ok(signal instanceof AbortSignal);
});

test('an answer without a results list is an error, not "no measurements"', async () => {
  await assert.rejects(
    hasMeasurements({ ...window, retries: 0, fetchImpl: async () => okResponse({ error: 'rate limited' }) }),
    /not in the expected format/,
  );
  assert.equal(await hasMeasurements({ ...window, fetchImpl: async () => okResponse({ results: [] }) }), false);
});

test('an aggregation answer without a result is an error', async () => {
  await assert.rejects(
    fetchDailyMeasurements({ asn: 44244, since: '2026-08-10', until: '2026-08-11', retries: 0, fetchImpl: async () => okResponse({}) }),
    /not in the expected format/,
  );
});
