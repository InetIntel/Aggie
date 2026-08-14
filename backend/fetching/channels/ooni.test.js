const test = require('node:test');
const assert = require('node:assert/strict');
const OONIChannel = require('./ooni');

test('creates one deterministic report from zero-measurement data', async () => {
  const requests = [];
  const queued = [];
  const now = new Date('2026-08-12T06:00:00.000Z');
  const channel = new OONIChannel({
    asns: '44244, 58224',
    now: () => now,
    reportExists: async () => false,
    fetchDailyMeasurements: async (request) => {
      requests.push(request);
      return [{
        measurement_start_day: '2026-08-11',
        measurement_count: request.asn === 44244 ? 0 : 15,
      }];
    },
  });
  channel.enqueue = (post) => queued.push(post);

  const posts = await channel.fetch();

  assert.deepEqual(requests, [
    { asn: 44244, since: '2026-08-11', until: '2026-08-12' },
    { asn: 58224, since: '2026-08-11', until: '2026-08-12' },
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
  assert.equal(posts[0].raw.triggers[0].measurementDay, '2026-08-11');
});

test('uses the prior alert date before the 06:00 UTC publication delay', async () => {
  let request;
  const channel = new OONIChannel({
    asns: '44244',
    now: () => new Date('2026-08-12T05:59:59.000Z'),
    reportExists: async () => true,
    fetchDailyMeasurements: async (value) => {
      request = value;
      return [];
    },
  });

  await channel.fetch();
  assert.deepEqual(request, {
    asn: 44244,
    since: '2026-08-10',
    until: '2026-08-11',
  });
});

test('rejects an invalid ASN list', () => {
  assert.throws(
    () => new OONIChannel({ asns: '44244 invalid' }),
    /one or more valid ASNs/,
  );
});