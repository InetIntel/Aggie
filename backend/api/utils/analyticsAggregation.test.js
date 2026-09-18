const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeOoniRows,
  formatNotableActivity,
  projectNotableActivityToReports,
} = require('./analyticsAggregation');

const KEY = 'as44244|islamic republic of iran';
const timeWindow = { bucketSizeMinutes: 60 };

function ms(iso) {
  return new Date(iso).getTime();
}

function iodaRow({ key = KEY, bucket, first = bucket, last = first, id = 'ioda-1' }) {
  return {
    _id: { eventAggKeyBase: key, bucketStartMs: ms(bucket), isOoni: false },
    totalReports: 1,
    reportIds: [id],
    mediaValues: [['ioda']],
    mediaPerReport: [['ioda']],
    signalSourceValues: ['BGP'],
    asnValues: ['as44244'],
    geoScopeValues: ['Islamic Republic of Iran'],
    incidentValues: [null],
    firstOutageStartedAtMs: ms(first),
    lastOutageStartedAtMs: ms(last),
  };
}

function ooniRow({ key = KEY, bucket, windowStart, id = 'ooni-1' }) {
  return {
    _id: { eventAggKeyBase: key, bucketStartMs: ms(bucket), isOoni: true },
    totalReports: 1,
    reportIds: [id],
    mediaValues: [['ooni']],
    mediaPerReport: [['ooni']],
    signalSourceValues: [],
    asnValues: ['as44244'],
    geoScopeValues: ['Islamic Republic of Iran'],
    incidentValues: [null],
    firstOutageStartedAtMs: ms(bucket),
    lastOutageStartedAtMs: ms(bucket),
    ooniWindowStart: windowStart,
  };
}

test('merges an OONI alert into the IODA activity whose outage started near windowStart', () => {
  const rows = mergeOoniRows([
    iodaRow({ bucket: '2026-08-11T14:00:00.000Z', first: '2026-08-11T14:10:00.000Z' }),
    ooniRow({ bucket: '2026-08-12T14:00:00.000Z', windowStart: '2026-08-11T14:30:00.000Z' }),
  ]);

  assert.equal(rows.length, 1);
  const activity = formatNotableActivity(rows[0], timeWindow);
  assert.deepEqual(activity.sources, ['ioda', 'ooni']);
  assert.equal(activity.isHighConfidence, true);
  assert.equal(activity.totalReports, 2);
  assert.deepEqual(activity.reportIds, ['ioda-1', 'ooni-1']);
  assert.equal(activity.bucketStart.toISOString(), '2026-08-11T14:00:00.000Z');
  // Each report stays counted in its own outageStartedAt bucket for the trend chart.
  assert.deepEqual(
    activity.reportBuckets.map((b) => [b.bucketStart.toISOString(), b.totalReports]),
    [['2026-08-11T14:00:00.000Z', 1], ['2026-08-12T14:00:00.000Z', 1]]
  );
  // Per-source counts back the chart's "by source" lines and sum to totalReports.
  assert.deepEqual(activity.reportBuckets.map((b) => b.sourceCounts), [
    { ioda: 1 },
    { ooni: 1 },
  ]);
});

test('keeps an OONI alert standalone when no same-key outage is within the window', () => {
  const rows = mergeOoniRows([
    iodaRow({ bucket: '2026-08-09T10:00:00.000Z' }),
    iodaRow({ key: 'as58224|islamic republic of iran', bucket: '2026-08-11T14:00:00.000Z' }),
    ooniRow({ bucket: '2026-08-12T14:00:00.000Z', windowStart: '2026-08-11T14:30:00.000Z' }),
  ]);

  assert.equal(rows.length, 3);
  const ooni = rows.find((row) => row._id.isOoni);
  assert.deepEqual(formatNotableActivity(ooni, timeWindow).sources, ['ooni']);
});

test('picks the closest match and always merges a same-bucket row', () => {
  const near = iodaRow({ bucket: '2026-08-11T15:00:00.000Z', id: 'near' });
  const far = iodaRow({ bucket: '2026-08-10T20:00:00.000Z', id: 'far' });
  const rows = mergeOoniRows([
    far,
    near,
    ooniRow({ bucket: '2026-08-12T14:00:00.000Z', windowStart: '2026-08-11T14:30:00.000Z' }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(near.totalReports, 2);
  assert.equal(far.totalReports, 1);

  // Same bucket but >24h from windowStart: merged anyway to avoid a duplicate eventAggKey.
  const sameBucket = iodaRow({ bucket: '2026-08-12T00:00:00.000Z', first: '2026-08-12T23:00:00.000Z' });
  const merged = mergeOoniRows([
    sameBucket,
    ooniRow({ bucket: '2026-08-12T00:00:00.000Z', windowStart: '2026-08-11T00:30:00.000Z' }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(sameBucket.totalReports, 2);
});

test('projection re-derives report buckets from the visible reports', () => {
  const activity = {
    bucketStart: new Date('2026-08-11T14:00:00.000Z'),
    bucketSizeMinutes: 60,
  };
  const reports = [
    { _id: 'ioda-1', _media: ['ioda'], outageStartedAt: new Date('2026-08-11T14:10:00.000Z') },
    { _id: 'ooni-1', _media: ['ooni'], outageStartedAt: new Date(ms('2026-08-12T14:30:00.000Z')) },
  ];

  const full = projectNotableActivityToReports(activity, reports);
  assert.equal(full.reportBuckets.length, 2);
  assert.deepEqual(full.reportBuckets.map((b) => b.sourceCounts), [{ ioda: 1 }, { ooni: 1 }]);
  assert.equal(full.reportBuckets[1].bucketStart.getTime(), ms('2026-08-12T14:00:00.000Z'));

  const iodaOnly = projectNotableActivityToReports(activity, reports.slice(0, 1));
  assert.deepEqual(iodaOnly.sources, ['ioda']);
  assert.equal(iodaOnly.isHighConfidence, false);
  assert.equal(iodaOnly.reportBuckets.length, 1);
});
