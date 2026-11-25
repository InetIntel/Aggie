const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDailyCounts,
  cleanDomainList,
  normalizeDomainConfig,
  evaluateRollingAlert,
  evaluateRollingDomainAlerts,
} = require('./ooniAlerts');
const defaultDomainConfig = require('./config/ooni.json');

test('fills omitted aggregation days with zero measurements', () => {
  const rows = [
    { measurement_start_day: '2025-12-01', measurement_count: 70 },
    { measurement_start_day: '2025-12-03', measurement_count: 20 },
  ];

  const daily = normalizeDailyCounts(rows, '2025-12-01', '2025-12-04');

  assert.deepEqual(daily, [
    { day: '2025-12-01', measurementCount: 70 },
    { day: '2025-12-02', measurementCount: 0 },
    { day: '2025-12-03', measurementCount: 20 },
  ]);
});

test('normalizes and validates the repository domain configuration', () => {
  assert.equal(defaultDomainConfig.useAllDomains, false);
  assert.equal(defaultDomainConfig.domains.length, 50);
  assert.deepEqual(normalizeDomainConfig({
    useAllDomains: false,
    domains: ['Example.com', 'example.com'],
  }), {
    useAllDomains: false,
    domains: ['example.com'],
  });
  assert.throws(
    () => normalizeDomainConfig({ useAllDomains: false, domains: ['invalid domain'] }),
    /invalid domain/,
  );
});

test('alerts when an exact rolling window has no measurements', () => {
  const alerts = evaluateRollingAlert(
    false,
    '2026-08-13T12:30:00.000Z',
    '2026-08-14T12:30:00.000Z',
  );

  assert.deepEqual(alerts, [{
    type: 'zero_measurements',
    alertDate: '2026-08-14',
    windowStart: '2026-08-13T12:30:00.000Z',
    windowEnd: '2026-08-14T12:30:00.000Z',
    measurementCount: 0,
  }]);
  assert.deepEqual(evaluateRollingAlert(
    true,
    '2026-08-13T12:30:00.000Z',
    '2026-08-14T12:30:00.000Z',
  ), []);
});

test('groups domains absent from an exact rolling window', () => {
  const alerts = evaluateRollingDomainAlerts([
    { domain: 'measured.example', hasMeasurements: true },
    { domain: 'missing.example', hasMeasurements: false },
  ], ['measured.example', 'missing.example'],
  '2026-08-13T12:30:00.000Z', '2026-08-14T12:30:00.000Z');

  assert.deepEqual(alerts, [{
    type: 'zero_domain_measurements',
    domain: 'missing.example',
    alertDate: '2026-08-14',
    windowStart: '2026-08-13T12:30:00.000Z',
    windowEnd: '2026-08-14T12:30:00.000Z',
    measurementCount: 0,
  }]);
});
test('a domain whose check failed is neither measured nor a zero-measurement trigger', () => {
  const rows = [
    { domain: 'measured.example', hasMeasurements: true },
    { domain: 'unknown.example', unknown: true },
    { domain: 'missing.example', hasMeasurements: false },
  ];
  const alerts = evaluateRollingDomainAlerts(
    rows,
    ['measured.example', 'unknown.example', 'missing.example'],
    '2026-08-13T12:30:00.000Z',
    '2026-08-14T12:30:00.000Z',
  );
  assert.deepEqual(alerts.map((alert) => alert.domain), ['missing.example']);
});

test('cleans a typed domain list and names the entries that are not hostnames', () => {
  const { domains, invalid } = cleanDomainList([
    ' Example.COM. ',
    'example.com',
    'bücher.example',
    'bad_domain',
    'http://example.org',
    'localhost',
    '',
    null,
  ]);
  assert.deepEqual(domains, ['example.com', 'xn--bcher-kva.example']);
  assert.deepEqual(invalid, ['bad_domain', 'http://example.org', 'localhost']);
});
