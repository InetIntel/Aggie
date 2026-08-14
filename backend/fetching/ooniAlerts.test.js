const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDailyCounts,
  evaluateAlert,
  normalizeDomainConfig,
  evaluateDomainAlerts,
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

test('alerts when the completed day has zero measurements', () => {
  const alerts = evaluateAlert([
    { day: '2025-12-15', measurementCount: 50 },
    { day: '2025-12-16', measurementCount: 0 },
  ], '2025-12-17');

  assert.deepEqual(alerts, [{
    type: 'zero_measurements',
    alertDate: '2025-12-17',
    measurementDay: '2025-12-16',
    measurementCount: 0,
  }]);
});

test('does not alert when the completed day has measurements', () => {
  const alerts = evaluateAlert([
    { day: '2025-12-16', measurementCount: 60 },
  ], '2025-12-17');

  assert.deepEqual(alerts, []);
});

test('groups zero-measurement watched domains into domain triggers', () => {
  const alerts = evaluateDomainAlerts([
    { domain: 'example.com', measurement_count: 3 },
  ], ['example.com', 'missing.example'], '2025-12-17');

  assert.deepEqual(alerts, [{
    type: 'zero_domain_measurements',
    domain: 'missing.example',
    alertDate: '2025-12-17',
    measurementDay: '2025-12-16',
    measurementCount: 0,
  }]);
});

test('does not alert when every watched domain has measurements', () => {
  const alerts = evaluateDomainAlerts([
    { domain: 'one.example', measurement_count: 2 },
    { domain: 'two.example', measurement_count: 1 },
  ], ['one.example', 'two.example'], '2025-12-17');

  assert.deepEqual(alerts, []);
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