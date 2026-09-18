const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clusterRowsByStartTime,
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

// --- startTime aggregation -------------------------------------------------
// Under this method the pipeline emits one row per distinct outage start, and
// clusterRowsByStartTime chains them. These fixtures are those single-start rows.

const MIN = 60 * 1000;

// Under startTime the pipeline no longer groups on eventAggKeyBase, so _id.eventAggKeyBase
// is null and the key travels in eventAggKeyBaseValues instead.
function startRow({
  key = KEY,
  at,
  id,
  media = 'ioda',
  signal = 'BGP',
  asn = 'as44244',
  geoScope = 'Islamic Republic of Iran',
}) {
  return {
    _id: { eventAggKeyBase: null, bucketStartMs: ms(at), isOoni: false },
    totalReports: 1,
    reportIds: [id],
    mediaValues: [[media]],
    mediaPerReport: [[media]],
    startedAtPerReport: [ms(at)],
    signalSourceValues: [signal],
    asnValues: [asn],
    geoScopeValues: [geoScope],
    locationValues: [{ asn, geoScope }],
    eventAggKeyBaseValues: [key],
    incidentValues: [null],
    firstOutageStartedAtMs: ms(at),
    lastOutageStartedAtMs: ms(at),
  };
}

const startTimeWindow = {
  bucketSizeMinutes: 60,
  aggregationMethod: 'startTime',
  startTimeToleranceMinutes: 5,
};

test('chains reports within tolerance and splits on a larger gap', () => {
  const clusters = clusterRowsByStartTime([
    startRow({ at: '2026-08-11T14:02:00.000Z', id: 'a' }),
    startRow({ at: '2026-08-11T14:04:30.000Z', id: 'b' }),
    startRow({ at: '2026-08-11T14:45:10.000Z', id: 'c' }),
    startRow({ at: '2026-08-11T14:47:00.000Z', id: 'd' }),
  ], 5 * MIN);

  assert.equal(clusters.length, 2);
  const [first, second] = clusters.map((row) => formatNotableActivity(row, startTimeWindow));

  assert.deepEqual(first.reportIds, ['a', 'b']);
  assert.equal(first.bucketStart.toISOString(), '2026-08-11T14:02:00.000Z');
  // The window spans the reports that actually clustered, not a whole grid cell.
  assert.equal(first.bucketEnd.toISOString(), '2026-08-11T14:04:30.000Z');

  assert.deepEqual(second.reportIds, ['c', 'd']);
  assert.equal(second.bucketStart.toISOString(), '2026-08-11T14:45:10.000Z');
});

test('chains transitively: each gap is measured from the previous report, not the first', () => {
  const clusters = clusterRowsByStartTime([
    startRow({ at: '2026-08-11T14:00:00.000Z', id: 'a' }),
    startRow({ at: '2026-08-11T14:04:00.000Z', id: 'b' }),
    startRow({ at: '2026-08-11T14:08:00.000Z', id: 'c' }),
  ], 5 * MIN);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].totalReports, 3);
  // 14:08 is 8 minutes from the first report but only 4 from the previous one.
  assert.equal(clusters[0].lastOutageStartedAtMs, ms('2026-08-11T14:08:00.000Z'));
});

test('tolerance 0 groups only byte-identical start times', () => {
  const clusters = clusterRowsByStartTime([
    startRow({ at: '2026-08-11T14:02:00.000Z', id: 'a' }),
    startRow({ at: '2026-08-11T14:02:00.000Z', id: 'b', media: 'cloudflare' }),
    startRow({ at: '2026-08-11T14:02:01.000Z', id: 'c' }),
  ], 0);

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0].reportIds, ['a', 'b']);
  assert.deepEqual(clusters[1].reportIds, ['c']);
});

test('keeps reports together across a grid boundary that time bucketing would split', () => {
  // 13:58 and 14:01 fall in different 1h buckets but are 3 minutes apart.
  const rows = [
    startRow({ at: '2026-08-11T13:58:00.000Z', id: 'before' }),
    startRow({ at: '2026-08-11T14:01:00.000Z', id: 'after', media: 'cloudflare' }),
  ];

  const clusters = clusterRowsByStartTime(rows, 5 * MIN);
  assert.equal(clusters.length, 1);

  const activity = formatNotableActivity(clusters[0], startTimeWindow);
  assert.deepEqual(activity.reportIds, ['before', 'after']);
  assert.deepEqual(activity.sources, ['cloudflare', 'ioda']);
  assert.equal(activity.isHighConfidence, true);

  // The activity is not grid-aligned, but the trend chart's buckets still are, and each
  // report is counted in the grid bucket of its own outage start.
  assert.deepEqual(
    activity.reportBuckets.map((b) => [b.bucketStart.toISOString(), b.totalReports]),
    [['2026-08-11T13:00:00.000Z', 1], ['2026-08-11T14:00:00.000Z', 1]]
  );
  assert.deepEqual(activity.reportBuckets.map((b) => b.sourceCounts), [
    { ioda: 1 },
    { cloudflare: 1 },
  ]);
});

test('chains across eventAggKeyBases: one activity can span several ASNs', () => {
  const clusters = clusterRowsByStartTime([
    startRow({ at: '2026-08-11T14:00:00.000Z', id: 'iran' }),
    startRow({
      key: 'as58224|islamic republic of iran',
      at: '2026-08-11T14:01:00.000Z',
      id: 'other',
      asn: 'as58224',
    }),
    startRow({ at: '2026-08-11T14:01:30.000Z', id: 'ooni', media: 'ooni' }),
  ], 5 * MIN);

  // Different keys, and an OONI report, but all three started within the tolerance.
  assert.equal(clusters.length, 1);

  const activity = formatNotableActivity(clusters[0], startTimeWindow);
  assert.deepEqual(activity.reportIds, ['iran', 'other', 'ooni']);
  assert.deepEqual(activity.asns, ['as44244', 'as58224']);
  assert.deepEqual(activity.locations, [
    'as44244 / Islamic Republic of Iran',
    'as58224 / Islamic Republic of Iran',
  ]);
  assert.deepEqual(activity.eventAggKeyBases, [
    'as44244|islamic republic of iran',
    'as58224|islamic republic of iran',
  ]);
  // Spanning several ASNs leaves no single value for the legacy scalar fields.
  assert.equal(activity.asn, undefined);
  assert.equal(activity.eventAggKeyBase, '*');
  assert.equal(activity.eventAggKey, '*|2026-08-11T14:00:00.000Z|startTime:5');
});

test('still separates clusters that are far apart in time, whatever their key', () => {
  const clusters = clusterRowsByStartTime([
    startRow({ at: '2026-08-11T14:00:00.000Z', id: 'a' }),
    startRow({ key: 'as58224|other', at: '2026-08-11T18:00:00.000Z', id: 'b', asn: 'as58224' }),
  ], 5 * MIN);

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((c) => c.reportIds[0]), ['a', 'b']);
});

test('distinct locations pair asn with region per report, not as a cross product', () => {
  const clusters = clusterRowsByStartTime([
    startRow({ at: '2026-08-11T14:00:00.000Z', id: 'a', asn: 'as1', geoScope: 'Region A' }),
    startRow({ at: '2026-08-11T14:01:00.000Z', id: 'b', asn: 'as2', geoScope: 'Region B' }),
    startRow({ at: '2026-08-11T14:02:00.000Z', id: 'c', asn: 'as1', geoScope: 'Region A' }),
  ], 5 * MIN);

  const activity = formatNotableActivity(clusters[0], startTimeWindow);
  assert.deepEqual(activity.locations, ['as1 / Region A', 'as2 / Region B']);
  assert.deepEqual(activity.asns, ['as1', 'as2']);
});

test('the two methods produce different eventAggKeys for the same reports', () => {
  const row = startRow({ at: '2026-08-11T14:02:00.000Z', id: 'a' });

  const byStartTime = formatNotableActivity(row, startTimeWindow);
  const byBucket = formatNotableActivity(
    {
      ...row,
      _id: {
        ...row._id,
        eventAggKeyBase: KEY,
        bucketStartMs: ms('2026-08-11T14:00:00.000Z'),
      },
    },
    timeWindow
  );

  // The start-time key carries the '*' sentinel: it is not tied to one asn|geoScope.
  assert.equal(byStartTime.eventAggKey, '*|2026-08-11T14:02:00.000Z|startTime:5');
  assert.equal(byBucket.eventAggKey, `${KEY}|2026-08-11T14:00:00.000Z|60`);
  assert.notEqual(byStartTime.eventAggKey, byBucket.eventAggKey);
  assert.equal(byStartTime.aggregationMethod, 'startTime');
  assert.equal(byBucket.aggregationMethod, 'bucket');
});

test('OONI reports cluster on their own start rather than being folded back by key', () => {
  // The bucket method would merge this OONI alert into the IODA activity a day earlier via
  // its windowStart. startTime has no key to fold it into, so it stands on its own time.
  const clusters = clusterRowsByStartTime([
    startRow({ at: '2026-08-11T14:02:00.000Z', id: 'ioda-1' }),
    startRow({ at: '2026-08-11T14:04:00.000Z', id: 'ioda-2' }),
    startRow({ at: '2026-08-12T14:00:00.000Z', id: 'ooni-1', media: 'ooni' }),
  ], 5 * MIN);

  assert.equal(clusters.length, 2);
  const [iodaActivity, ooniActivity] = clusters.map((row) =>
    formatNotableActivity(row, startTimeWindow)
  );

  assert.equal(iodaActivity.totalReports, 2);
  assert.deepEqual(iodaActivity.sources, ['ioda']);
  assert.equal(iodaActivity.bucketEnd.toISOString(), '2026-08-11T14:04:00.000Z');

  assert.deepEqual(ooniActivity.sources, ['ooni']);
  assert.deepEqual(
    ooniActivity.reportBuckets.map((b) => [b.bucketStart.toISOString(), b.totalReports]),
    [['2026-08-12T14:00:00.000Z', 1]]
  );
});
