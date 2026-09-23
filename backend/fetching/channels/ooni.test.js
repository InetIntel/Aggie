const test = require('node:test');
const assert = require('node:assert/strict');
const OONIChannel = require('./ooni');

test('creates one deduplicated report from a zero-measurement rolling window', async () => {
  const requests = [];
  const queued = [];
  const now = new Date('2026-08-12T14:30:00.000Z');
  const channel = new OONIChannel({
    asns: '44244, 58224',
    domainConfig: { useAllDomains: true, domains: [] },
    now: () => now,
    reportExists: async () => false,
    hasMeasurements: async (request) => {
      requests.push(request);
      return request.asn !== 44244;
    },
  });
  channel.enqueue = (post) => queued.push(post);

  const posts = await channel.fetch();

  assert.deepEqual(requests, [
    { asn: 44244, since: '2026-08-11T14:30:00.000Z', until: '2026-08-12T14:30:00.000Z' },
    { asn: 58224, since: '2026-08-11T14:30:00.000Z', until: '2026-08-12T14:30:00.000Z' },
  ]);
  assert.equal(posts.length, 1);
  assert.equal(queued.length, 1);
  assert.equal(posts[0].platform, 'ooni');
  assert.equal(posts[0].platformID, 'ooni:44244:volume:2026-08-12');
  assert.equal(posts[0].isOutageEvent, true);
  assert.equal(posts[0].isAsnScoped, true);
  assert.equal(posts[0].asn, 'as44244');
  assert.equal(posts[0].raw.networkName, 'IranCell');
  assert.equal(posts[0].raw.entityLevel, 'AS');
  assert.equal(posts[0].raw.windowStart, '2026-08-11T14:30:00.000Z');
  assert.equal(posts[0].raw.windowEnd, '2026-08-12T14:30:00.000Z');
  // Aggregation fields: stamped at detection time, keyed like IODA/Cloudflare AS events.
  assert.equal(posts[0].outageStartedAt.toISOString(), '2026-08-12T14:30:00.000Z');
  assert.equal(posts[0].geoScope, 'Islamic Republic of Iran');
  assert.equal(posts[0].eventAggKeyBase, 'as44244|islamic republic of iran');
  assert.equal(posts[0].eventIdentifier, undefined);
  assert.equal(posts[0].raw.dataSource, 'OONI Web Connectivity');
});

test('skips later rolling checks when the UTC end-date already has a report', async () => {
  let requested = false;
  const channel = new OONIChannel({
    asns: '44244',
    domainConfig: { useAllDomains: true, domains: [] },
    now: () => new Date('2026-08-12T18:00:00.000Z'),
    reportExists: async () => true,
    hasMeasurements: async () => {
      requested = true;
      return false;
    },
  });

  const posts = await channel.fetch();
  assert.equal(requested, false);
  assert.deepEqual(posts, []);
});

test('creates one report containing all watched domains with zero measurements', async () => {
  const queued = [];
  const channel = new OONIChannel({
    asns: '44244',
    domainConfig: {
      useAllDomains: false,
      domains: ['measured.example', 'missing.example'],
    },
    now: () => new Date('2026-08-12T14:30:00.000Z'),
    reportExists: async () => false,
    hasMeasurements: async ({ domain, since, until }) => {
      assert.equal(since, '2026-08-11T14:30:00.000Z');
      assert.equal(until, '2026-08-12T14:30:00.000Z');
      return domain === 'measured.example';
    },
    fetchSeries: async () => null,
  });
  channel.enqueue = (post) => queued.push(post);

  const posts = await channel.fetch();

  assert.equal(posts.length, 1);
  assert.equal(queued.length, 1);
  assert.equal(posts[0].raw.domainMode, 'selected');
  assert.equal(posts[0].platformID, 'ooni:44244:domains:2026-08-12');
  assert.deepEqual(posts[0].raw.zeroDomains, ['missing.example']);
  assert.equal(posts[0].raw.triggers[0].type, 'zero_domain_measurements');
  assert.equal(posts[0].raw.triggers[0].windowEnd, '2026-08-12T14:30:00.000Z');
});

test('rejects an invalid ASN list', () => {
  assert.throws(
    () => new OONIChannel({ asns: '44244 invalid' }),
    /one or more valid ASNs/,
  );
});

const selectedChannel = (overrides = {}) =>
  new OONIChannel({
    asns: '44244',
    domainConfig: { useAllDomains: false, domains: ['measured.example', 'missing.example'] },
    now: () => new Date('2026-08-12T14:30:00.000Z'),
    reportExists: async () => false,
    hasMeasurements: async ({ domain }) => domain === 'measured.example',
    ...overrides,
  });

test('stores the 14-day series on a new alert, ending on the alert day', async () => {
  const calls = [];
  const channel = selectedChannel({
    fetchSeries: async (request) => {
      calls.push(request);
      return { source: 'ooni-aggregation', from: '2026-07-30', until: '2026-08-12', days: [], domains: {} };
    },
  });
  channel.enqueue = () => {};

  const [post] = await channel.fetch();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].asn, 44244);
  assert.equal(calls[0].endDay, '2026-08-12');
  assert.deepEqual(calls[0].domains, ['measured.example', 'missing.example']);
  assert.equal(post.raw.chart.until, '2026-08-12');
  assert.equal(post.raw.chart.fetchedAt, post.fetchedAt.toISOString());
});

test('a window ending at midnight charts the day before it', async () => {
  const calls = [];
  const channel = selectedChannel({
    now: () => new Date('2026-08-12T00:00:00.000Z'),
    fetchSeries: async (request) => {
      calls.push(request);
      return { until: request.endDay, days: [], domains: {} };
    },
  });
  channel.enqueue = () => {};

  await channel.fetch();

  assert.equal(calls[0].endDay, '2026-08-11');
});

test('still creates the alert, without a chart, when the series cannot be fetched', async () => {
  const channel = selectedChannel({
    fetchSeries: async () => {
      throw new Error('OONI aggregation request failed (429)');
    },
  });
  channel.enqueue = () => {};
  const warn = console.warn;
  console.warn = () => {};

  let posts;
  try {
    posts = await channel.fetch();
  } finally {
    console.warn = warn;
  }

  assert.equal(posts.length, 1);
  assert.equal(posts[0].raw.chart, undefined);
  assert.deepEqual(posts[0].raw.zeroDomains, ['missing.example']);
});

test('does not fetch a series in all-domains mode', async () => {
  let called = false;
  const channel = new OONIChannel({
    asns: '44244',
    domainConfig: { useAllDomains: true, domains: [] },
    now: () => new Date('2026-08-12T14:30:00.000Z'),
    reportExists: async () => false,
    hasMeasurements: async () => false,
    fetchSeries: async () => {
      called = true;
      return null;
    },
  });
  channel.enqueue = () => {};

  const [post] = await channel.fetch();

  assert.equal(called, false);
  assert.equal(post.raw.chart, undefined);
});
