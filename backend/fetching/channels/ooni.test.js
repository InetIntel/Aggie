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