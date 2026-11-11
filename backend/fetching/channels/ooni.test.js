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
    { asn: 44244, since: '2026-08-11T14:30:00.000Z', until: '2026-08-12T14:30:00.000Z', probeCC: 'IR', testName: 'web_connectivity' },
    { asn: 58224, since: '2026-08-11T14:30:00.000Z', until: '2026-08-12T14:30:00.000Z', probeCC: 'IR', testName: 'web_connectivity' },
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

test('uses the configured probe country and test', async () => {
  const requests = [];
  const queued = [];
  const now = new Date('2026-08-12T14:30:00.000Z');
  const channel = new OONIChannel({
    asns: '12345',
    probeCC: 'RU',
    testName: 'telegram',
    domainConfig: { useAllDomains: true, domains: [] },
    now: () => now,
    reportExists: async () => false,
    hasMeasurements: async (request) => {
      requests.push(request);
      return false; // zero measurements -> alert
    },
  });
  channel.enqueue = (post) => queued.push(post);

  const posts = await channel.fetch();

  assert.equal(requests[0].probeCC, 'RU');
  assert.equal(requests[0].testName, 'telegram');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].raw.probeCC, 'RU');
  assert.equal(posts[0].raw.testName, 'telegram');
  // geoScope resolves from the configured probe country, not a hardcoded Iran.
  assert.equal(posts[0].geoScope, 'Russian Federation');
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

test('stores the series on a new alert, anchored on the hour the alert window ends', async () => {
  const calls = [];
  const channel = selectedChannel({
    fetchSeries: async (request) => {
      calls.push(request);
      return { source: 'ooni-aggregation', granularity: 'hour', blockHours: 24, until: request.anchor.toISOString(), starts: [], domains: {} };
    },
  });
  channel.enqueue = () => {};

  const [post] = await channel.fetch();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].asn, 44244);
  assert.equal(calls[0].anchor.toISOString(), '2026-08-12T14:00:00.000Z');
  assert.deepEqual(calls[0].domains, ['measured.example', 'missing.example']);
  assert.equal(post.raw.chart.until, '2026-08-12T14:00:00.000Z');
  assert.equal(post.raw.chart.fetchedAt, post.fetchedAt.toISOString());
});

test('a window ending at midnight is anchored at midnight, so its blocks are whole days', async () => {
  const calls = [];
  const channel = selectedChannel({
    now: () => new Date('2026-08-12T00:00:00.000Z'),
    fetchSeries: async (request) => {
      calls.push(request);
      return { until: request.anchor.toISOString(), starts: [], domains: {} };
    },
  });
  channel.enqueue = () => {};

  await channel.fetch();

  assert.equal(calls[0].anchor.toISOString(), '2026-08-12T00:00:00.000Z');
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

test('stores the chart domains as a list, since MongoDB rejects "." in field names', async () => {
  const channel = selectedChannel({
    fetchSeries: async (request) => ({
      source: 'ooni-aggregation',
      until: request.anchor.toISOString(),
      starts: [],
      domains: { 'www.example.com': [1, 2], 'b.example': [0, 0] },
    }),
  });
  channel.enqueue = () => {};

  const [post] = await channel.fetch();

  assert.deepEqual(post.raw.chart.domains, [
    { domain: 'www.example.com', counts: [1, 2] },
    { domain: 'b.example', counts: [0, 0] },
  ]);
  const hasDottedKey = (value) =>
    value && typeof value === 'object'
    && Object.entries(value).some(([key, inner]) => key.includes('.') || hasDottedKey(inner));
  assert.equal(hasDottedKey(post.raw), false);
});

// ---- failures while checking OONI ----

const quiet = async (work) => {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await work();
  } finally {
    console.log = log;
    console.warn = warn;
  }
};

const noChart = async () => null;

test('a domain that cannot be checked is not treated as zero measurements', async () => {
  const channel = selectedChannel({
    requestDelayMs: 0,
    domainConfig: { useAllDomains: false, domains: ['measured.example', 'broken.example', 'missing.example'] },
    hasMeasurements: async ({ domain }) => {
      if (domain === 'broken.example') throw new Error('OONI measurements request failed (500)');
      return domain === 'measured.example';
    },
    fetchSeries: noChart,
  });
  const queued = [];
  channel.enqueue = (post) => queued.push(post);

  await assert.rejects(quiet(() => channel.fetch()), /could not check 1 domain\(s\) \(broken.example\)/);

  assert.equal(queued.length, 1);
  assert.deepEqual(queued[0].raw.zeroDomains, ['missing.example']);
  assert.deepEqual(queued[0].raw.unverifiedDomains, ['broken.example']);
});

test('a network that cannot be checked does not stop the others', async () => {
  const channel = selectedChannel({
    asns: '44244 58224',
    requestDelayMs: 0,
    hasMeasurements: async ({ asn, domain }) => {
      if (asn === 44244) throw new Error('OONI measurements request failed (500)');
      return domain === 'measured.example';
    },
    fetchSeries: noChart,
  });
  const queued = [];
  channel.enqueue = (post) => queued.push(post);

  await assert.rejects(quiet(() => channel.fetch()), /AS44244/);

  assert.equal(queued.length, 1);
  assert.equal(queued[0].raw.probeASN, 58224);
});

test('stops asking OONI after several failed checks in a row', async () => {
  let calls = 0;
  const domains = Array.from({ length: 20 }, (_, i) => `d${i}.example`);
  const channel = selectedChannel({
    requestDelayMs: 0,
    domainConfig: { useAllDomains: false, domains },
    hasMeasurements: async () => { calls += 1; throw new Error('OONI measurements request failed (429)'); },
  });
  channel.enqueue = () => {};

  await assert.rejects(quiet(() => channel.fetch()), /kept failing, stopped after 5 failed checks/);

  assert.equal(calls, 5);
});

test('a failed check in all-domains mode is reported and creates no alert', async () => {
  const channel = selectedChannel({
    domainConfig: { useAllDomains: true, domains: [] },
    hasMeasurements: async () => { throw new Error('OONI measurements request failed (500)'); },
  });
  const queued = [];
  channel.enqueue = (post) => queued.push(post);

  await assert.rejects(quiet(() => channel.fetch()), /AS44244: OONI measurements request failed \(500\)/);
  assert.equal(queued.length, 0);
});

test('records the time of a clean check on the source', async () => {
  const times = [];
  const channel = selectedChannel({ requestDelayMs: 0, fetchSeries: noChart, onFetch: async (time) => times.push(time) });
  channel.enqueue = () => {};

  await quiet(() => channel.fetch());

  assert.deepEqual(times, [new Date('2026-08-12T14:30:00.000Z')]);
});

// ---- alert identity ----

test('keeps the original alert id for Iran web connectivity', async () => {
  const channel = selectedChannel({ requestDelayMs: 0, fetchSeries: noChart });
  channel.enqueue = () => {};
  const [post] = await channel.fetch();
  assert.equal(post.platformID, 'ooni:44244:domains:2026-08-12');
});

test('sources on the same network but a different country or test get different alert ids', async () => {
  const ids = [];
  for (const options of [{}, { probeCC: 'IQ' }, { testName: 'whatsapp' }]) {
    const channel = selectedChannel({ requestDelayMs: 0, fetchSeries: noChart, hasMeasurements: async () => false, ...options });
    channel.enqueue = () => {};
    const [post] = await channel.fetch();
    ids.push(post.platformID);
  }
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[1], 'ooni:44244:domains:IQ:web_connectivity:2026-08-12');
  assert.equal(ids[2], 'ooni:44244:domains:IR:whatsapp:2026-08-12');
});

// ---- source configuration ----

test('accepts ASNs written with an AS prefix and drops repeats', () => {
  const channel = new OONIChannel({ asns: 'AS44244, as58224 44244' });
  assert.deepEqual(channel.asns, [44244, 58224]);
});

// ---- what gets stored ----

test('the stored alert passes the same key check MongoDB applies on insert', async () => {
  const Bson = require('bson');
  const channel = selectedChannel({
    requestDelayMs: 0,
    fetchSeries: async (request) => ({
      source: 'ooni-aggregation',
      until: request.anchor.toISOString(),
      starts: [],
      domains: { 'measured.example': [1], 'missing.example': [0] },
    }),
  });
  channel.enqueue = () => {};
  const [post] = await channel.fetch();

  const insert = { insert: 'reports', documents: [{ guid: post.platformID, metadata: { rawAPIResponse: post.raw } }] };
  assert.doesNotThrow(() => new Bson().serialize(insert, { checkKeys: true }));
});
