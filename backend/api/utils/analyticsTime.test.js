const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_CUSTOM_RANGE_DAYS,
  floorToBucketStartMs,
  getBucketEndUtc,
  getBucketStartUtc,
  normalizeTimeZone,
  resolveAnalyticsTimeWindow,
} = require('./analyticsTime');

const NOW = new Date('2026-09-29T15:42:00.000Z');
const DAY = 24 * 60;

function iso(date) {
  return new Date(date).toISOString();
}

test('UTC grid is unchanged: floors on the epoch stride', () => {
  assert.equal(
    iso(getBucketStartUtc('2026-09-29T15:42:00.000Z', 60)),
    '2026-09-29T15:00:00.000Z'
  );
  assert.equal(
    iso(getBucketStartUtc('2026-09-29T15:42:00.000Z', DAY, 'UTC')),
    '2026-09-29T00:00:00.000Z'
  );
});

test('day buckets start at local midnight in the viewer zone', () => {
  // 01:30 UTC on the 30th is 21:30 on the 29th in New York (EDT, UTC-4).
  const start = getBucketStartUtc('2026-09-30T01:30:00.000Z', DAY, 'America/New_York');
  assert.equal(iso(start), '2026-09-29T04:00:00.000Z');
  assert.equal(
    iso(getBucketEndUtc(start, DAY, 'America/New_York')),
    '2026-09-30T04:00:00.000Z'
  );
});

test('quarter-hour zones align sub-day buckets to local time', () => {
  // Kathmandu is UTC+5:45; its 6h buckets start at 00/06/12/18 local.
  const start = getBucketStartUtc('2026-09-29T15:42:00.000Z', 6 * 60, 'Asia/Kathmandu');
  assert.equal(iso(start), '2026-09-29T12:15:00.000Z'); // 18:00 local
});

test('a day bucket across a DST change is 23 or 25 hours, not shifted', () => {
  const tz = 'America/New_York';
  // US DST ends 2026-11-01: that local day is 25 hours long.
  const fallStart = getBucketStartUtc('2026-11-01T12:00:00.000Z', DAY, tz);
  const fallEnd = getBucketEndUtc(fallStart, DAY, tz);
  assert.equal(iso(fallStart), '2026-11-01T04:00:00.000Z');
  assert.equal(iso(fallEnd), '2026-11-02T05:00:00.000Z');

  // US DST starts 2026-03-08: that local day is 23 hours long.
  const springStart = getBucketStartUtc('2026-03-08T12:00:00.000Z', DAY, tz);
  const springEnd = getBucketEndUtc(springStart, DAY, tz);
  assert.equal(iso(springStart), '2026-03-08T05:00:00.000Z');
  assert.equal(iso(springEnd), '2026-03-09T04:00:00.000Z');
});

test('walking bucket ends through a DST change always moves forward and covers every instant', () => {
  for (const tz of ['America/New_York', 'Europe/London', 'Australia/Lord_Howe']) {
    for (const minutes of [30, 60, 360, DAY]) {
      for (const [from, to] of [
        ['2026-03-07T00:00:00.000Z', '2026-03-10T00:00:00.000Z'],
        ['2026-03-28T00:00:00.000Z', '2026-04-06T00:00:00.000Z'],
        ['2026-10-24T00:00:00.000Z', '2026-11-03T00:00:00.000Z'],
      ]) {
        let cursor = getBucketStartUtc(from, minutes, tz);
        const end = new Date(to);
        let steps = 0;
        while (cursor < end) {
          const next = getBucketEndUtc(cursor, minutes, tz);
          assert.ok(next > cursor, `${tz} ${minutes}m stalled at ${iso(cursor)}`);
          // Every instant the walk puts in this bucket floors back to its start, so the
          // seeded chart buckets and the per-report counts always agree.
          for (let probe = cursor.getTime(); probe < next.getTime(); probe += 5 * 60 * 1000) {
            assert.equal(
              iso(floorToBucketStartMs(probe, minutes, tz)),
              iso(cursor),
              `${tz} ${minutes}m: ${iso(probe)} in [${iso(cursor)}, ${iso(next)})`
            );
          }
          cursor = next;
          steps += 1;
          assert.ok(steps < 2000);
        }
      }
    }
  }
});

test('normalizeTimeZone canonicalizes and rejects unknown zones', () => {
  assert.equal(normalizeTimeZone(undefined), 'UTC');
  assert.equal(normalizeTimeZone('Etc/UTC'), 'UTC');
  assert.equal(normalizeTimeZone('America/New_York'), 'America/New_York');
  assert.throws(() => normalizeTimeZone('Mars/Olympus'), /Unsupported analytics time zone/);
});

test('today starts at midnight in the requested zone', () => {
  const window = resolveAnalyticsTimeWindow({
    range: 'today',
    bucket: '1h',
    timeZone: 'America/New_York',
    now: NOW,
  });
  assert.equal(iso(window.rangeStartUtc), '2026-09-29T04:00:00.000Z');
  assert.equal(window.timeZone, 'America/New_York');
});

test('custom range: bounds pass through, end is capped at the snapped now', () => {
  const window = resolveAnalyticsTimeWindow({
    range: 'custom',
    from: '2026-09-27T00:00:00.000Z',
    to: '2026-09-30T00:00:00.000Z',
    bucket: '6h',
    now: NOW,
  });
  assert.equal(iso(window.rangeStartUtc), '2026-09-27T00:00:00.000Z');
  assert.equal(iso(window.rangeEndUtc), '2026-09-29T15:40:00.000Z');
});

test('custom range: buckets follow the span', () => {
  const base = { range: 'custom', now: NOW, to: '2026-09-29T00:00:00.000Z' };
  // Two days allows 30m; ten days does not.
  assert.equal(
    resolveAnalyticsTimeWindow({ ...base, from: '2026-09-27T00:00:00.000Z', bucket: '30m' })
      .bucketSizeMinutes,
    30
  );
  assert.throws(
    () => resolveAnalyticsTimeWindow({ ...base, from: '2026-09-19T00:00:00.000Z', bucket: '30m' }),
    /Unsupported analytics bucket preset/
  );
  // Omitting the bucket picks 1h up to a week, 6h past it.
  assert.equal(
    resolveAnalyticsTimeWindow({ ...base, from: '2026-09-22T00:00:00.000Z' }).bucketPreset,
    '1h'
  );
  assert.equal(
    resolveAnalyticsTimeWindow({ ...base, from: '2026-09-21T00:00:00.000Z' }).bucketPreset,
    '6h'
  );
  assert.equal(
    resolveAnalyticsTimeWindow({ ...base, from: '2026-09-01T00:00:00.000Z' }).bucketPreset,
    '6h'
  );
  assert.throws(
    () => resolveAnalyticsTimeWindow({ ...base, from: '2026-09-21T00:00:00.000Z', bucket: '1h' }),
    /Unsupported analytics bucket preset/
  );
});

test('custom range: rejects bad, inverted, future-only and oversized ranges', () => {
  const base = { range: 'custom', now: NOW };
  assert.throws(
    () => resolveAnalyticsTimeWindow({ ...base, from: 'nope', to: '2026-09-29T00:00:00.000Z' }),
    /Unsupported analytics custom range/
  );
  assert.throws(
    () => resolveAnalyticsTimeWindow({
      ...base,
      from: '2026-09-29T00:00:00.000Z',
      to: '2026-09-28T00:00:00.000Z',
    }),
    /Unsupported analytics custom range/
  );
  assert.throws(
    () => resolveAnalyticsTimeWindow({
      ...base,
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T00:00:00.000Z',
    }),
    /Unsupported analytics custom range/
  );
  const tooEarly = new Date(NOW.getTime() - (MAX_CUSTOM_RANGE_DAYS + 1) * DAY * 60 * 1000);
  assert.throws(
    () => resolveAnalyticsTimeWindow({ ...base, from: tooEarly, to: NOW }),
    /longer than/
  );
});

test('custom range through today keeps the bucket choices of the span requested', () => {
  // Requested: three whole days ending tomorrow. Cut at now it is only ~2.7 days, which
  // would otherwise allow 30m and refuse 24h.
  const window = resolveAnalyticsTimeWindow({
    range: 'custom',
    from: '2026-09-27T00:00:00.000Z',
    to: '2026-09-30T00:00:00.000Z',
    bucket: '24h',
    now: new Date('2026-09-29T01:00:00.000Z'),
  });
  assert.equal(window.bucketSizeMinutes, 24 * 60);
});

test('presets still reject a bucket they do not offer', () => {
  assert.throws(
    () => resolveAnalyticsTimeWindow({ range: 'last7d', bucket: '30m', now: NOW }),
    /Unsupported analytics bucket preset/
  );
  assert.equal(resolveAnalyticsTimeWindow({ range: 'last7d', now: NOW }).bucketPreset, '1h');
  assert.throws(
    () => resolveAnalyticsTimeWindow({ range: 'last24h', bucket: '30m', now: NOW }),
    /Unsupported analytics bucket preset/
  );
});
