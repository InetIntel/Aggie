'use strict';

const {
  AGGREGATION_METHODS,
  getBucketEndUtc,
  isStartTimeAggregation,
  resolveAnalyticsTimeWindow,
} = require('./analyticsTime');

const HIGH_CONFIDENCE_MIN_COUNT = 2;

// Start-time activities are not tied to one asn|geoScope, so they have no single
// eventAggKeyBase. This stands in for one in the eventAggKey, which still has to be
// unique per cache key (the cluster's start time makes it so).
const START_TIME_KEY_BASE = '*';

// OONI rows are grouped separately and then merged into the nearest same-key 
// activity whose outage started within this window of the OONI windowStart 
// (the latest moment the silence can have begun).
const OONI_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

function buildOutageReportMatch(timeWindow) {
  return {
    isOutageEvent: true,
    outageStartedAt: {
      $gte: timeWindow.rangeStartUtc,
      $lt: timeWindow.rangeEndUtc,
    },
    eventAggKeyBase: {
      $exists: true,
      $type: 'string',
      $ne: '',
    },
  };
}

async function aggregateNotableActivities(options = {}) {
  const timeWindow = options.timeWindow || resolveAnalyticsTimeWindow(options);
  const match = buildOutageReportMatch(timeWindow);
  const pipeline = buildAggregationPipeline(match, timeWindow);

  const Report = require('../../models/report');
  // Under `startTime` the pipeline emits one row per distinct outage start, which the
  // clustering pass then chains into activities. Under `bucket` the pipeline already
  // emits one row per grid bucket and the pass is skipped.
  const pipelineRows = await Report.aggregate(pipeline).exec();
  const rows = isStartTimeAggregation(timeWindow)
    ? clusterRowsByStartTime(
        pipelineRows,
        timeWindow.startTimeToleranceMinutes * 60 * 1000
      )
    : mergeOoniRows(pipelineRows);
  const notableActivities = rows.map(function (row) {
    return formatNotableActivity(row, timeWindow);
  });

  notableActivities.sort(compareNotableActivities);

  if (typeof options.limit === 'number' && options.limit >= 0) {
    return notableActivities.slice(0, options.limit);
  }

  return notableActivities;
}

function buildAggregationPipeline(match, timeWindow) {
  const bucketMs = timeWindow.bucketSizeMinutes * 60 * 1000;
  // `startTime` groups on the raw outage start so each distinct timestamp is its own
  // row; clusterRowsByStartTime then chains rows that fall within the tolerance.
  const groupKeyMs = isStartTimeAggregation(timeWindow)
    ? '$outageStartedAtMs'
    : {
        $subtract: [
          '$outageStartedAtMs',
          { $mod: ['$outageStartedAtMs', bucketMs] },
        ],
      };

  const isStartTime = isStartTimeAggregation(timeWindow);

  return [
    { $match: match },
    {
      $addFields: {
        outageStartedAtMs: { $toLong: '$outageStartedAt' },
      },
    },
    {
      $addFields: {
        bucketStartMs: groupKeyMs,
      },
    },
    {
      $group: {
        _id: {
          eventAggKeyBase: isStartTime
            ? { $literal: null }
            : '$eventAggKeyBase',
          bucketStartMs: '$bucketStartMs',
          isOoni: isStartTime
            ? { $literal: false }
            : {
                $cond: [
                  { $isArray: '$_media' },
                  { $in: ['ooni', '$_media'] },
                  { $eq: ['$_media', 'ooni'] },
                ],
              },
        },
        totalReports: { $sum: 1 },
        reportIds: { $push: '$_id' },
        mediaValues: { $addToSet: '$_media' },
        // Per report (not deduped), so the trend chart can split a bucket by source.
        mediaPerReport: { $push: '$_media' },
        // Parallel to mediaPerReport. Lets the trend chart place each report in the grid
        // bucket of its own outage start even when the activity itself is not grid-aligned.
        startedAtPerReport: { $push: '$outageStartedAtMs' },
        signalSourceValues: { $addToSet: '$metadata.rawAPIResponse.dataSource' },
        asnValues: { $addToSet: '$asn' },
        geoScopeValues: { $addToSet: '$geoScope' },
        // Paired per report so a multi-ASN activity can list real "asn / region" combos
        // rather than a cross product of the two distinct-value lists.
        locationValues: { $addToSet: { asn: '$asn', geoScope: '$geoScope' } },
        // Every key folded into this activity. One value under `bucket`; potentially many
        // under `startTime`.
        eventAggKeyBaseValues: { $addToSet: '$eventAggKeyBase' },
        incidentValues: { $addToSet: '$_group' },
        firstOutageStartedAtMs: { $min: '$outageStartedAtMs' },
        lastOutageStartedAtMs: { $max: '$outageStartedAtMs' },
        // ISO strings, so $min picks the earliest. Only OONI reports carry one.
        ooniWindowStart: { $min: '$metadata.rawAPIResponse.windowStart' },
      },
    },
  ];
}

// Fields the pipeline accumulates per report or per value; a cluster is their concatenation.
const CLUSTER_CONCAT_FIELDS = [
  'reportIds',
  'mediaValues',
  'mediaPerReport',
  'startedAtPerReport',
  'signalSourceValues',
  'asnValues',
  'geoScopeValues',
  'locationValues',
  'eventAggKeyBaseValues',
  'incidentValues',
];

// Chain rows (one per distinct outage start) into activities: walk them in time order and
// stay in the current activity while the gap to the previous outage start is within
// tolerance, otherwise open a new one. Rows are chained across every eventAggKeyBase, so
// an activity holds whatever started together regardless of which ASN or region it hit.
function clusterRowsByStartTime(rows, toleranceMs) {
  const ordered = [...rows].sort(
    (a, b) => a._id.bucketStartMs - b._id.bucketStartMs
  );

  const clusters = [];
  let current = null;
  for (const row of ordered) {
    if (
      current &&
      row._id.bucketStartMs - current.lastOutageStartedAtMs <= toleranceMs
    ) {
      appendRowToCluster(current, row);
      continue;
    }
    current = startCluster(row);
    clusters.push(current);
  }

  return clusters;
}

// A cluster is shaped exactly like a pipeline row, so everything downstream — the OONI
// merge, formatting, the report-bucket split — reads both without branching.
function startCluster(row) {
  const cluster = {
    _id: { ...row._id },
    totalReports: row.totalReports || 0,
    firstOutageStartedAtMs: row.firstOutageStartedAtMs,
    lastOutageStartedAtMs: row.lastOutageStartedAtMs,
    ooniWindowStart: row.ooniWindowStart,
  };
  for (const field of CLUSTER_CONCAT_FIELDS) {
    cluster[field] = [...(row[field] || [])];
  }
  return cluster;
}

function appendRowToCluster(cluster, row) {
  cluster.totalReports += row.totalReports || 0;
  for (const field of CLUSTER_CONCAT_FIELDS) {
    cluster[field] = cluster[field].concat(row[field] || []);
  }
  cluster.firstOutageStartedAtMs = Math.min(
    cluster.firstOutageStartedAtMs,
    row.firstOutageStartedAtMs
  );
  cluster.lastOutageStartedAtMs = Math.max(
    cluster.lastOutageStartedAtMs,
    row.lastOutageStartedAtMs
  );
  if (
    row.ooniWindowStart &&
    (!cluster.ooniWindowStart || row.ooniWindowStart < cluster.ooniWindowStart)
  ) {
    cluster.ooniWindowStart = row.ooniWindowStart;
  }
}

// Fold each OONI row into the nearest non-OONI row with the same eventAggKeyBase whose
// outages started within OONI_MATCH_WINDOW_MS of the OONI windowStart. 
function mergeOoniRows(rows) {
  const targets = rows.filter((row) => !row._id.isOoni);
  const merged = [];

  for (const row of rows) {
    if (!row._id.isOoni) continue;

    const target = findOoniMergeTarget(row, targets);
    if (!target) {
      merged.push(row);
      continue;
    }

    target.totalReports += row.totalReports || 0;
    target.reportIds = (target.reportIds || []).concat(row.reportIds || []);
    for (const field of [
      'mediaValues',
      'signalSourceValues',
      'asnValues',
      'geoScopeValues',
      'incidentValues',
    ]) {
      target[field] = (target[field] || []).concat(row[field] || []);
    }
    // Keep the merged row intact rather than pre-bucketing it here: buildReportBuckets
    // owns the grid, and under `startTime` a row's own key is not grid-aligned.
    target.mergedRows = (target.mergedRows || []).concat(row);
  }

  return targets.concat(merged);
}

function findOoniMergeTarget(ooniRow, targets) {
  const windowStartMs = new Date(ooniRow.ooniWindowStart).getTime();
  let best = null;
  let bestDistance = Infinity;

  for (const target of targets) {
    if (target._id.eventAggKeyBase !== ooniRow._id.eventAggKeyBase) continue;

    if (target._id.bucketStartMs === ooniRow._id.bucketStartMs) return target;
    if (Number.isNaN(windowStartMs)) continue;

    // Distance from windowStart to the target's [first, last] outage start interval.
    const distance = Math.max(
      target.firstOutageStartedAtMs - windowStartMs,
      windowStartMs - target.lastOutageStartedAtMs,
      0
    );
    if (
      distance <= OONI_MATCH_WINDOW_MS &&
      (distance < bestDistance ||
        (distance === bestDistance && target._id.bucketStartMs < best._id.bucketStartMs))
    ) {
      best = target;
      bestDistance = distance;
    }
  }

  return best;
}

function formatNotableActivity(row, timeWindow) {
  const bucketStart = new Date(row._id.bucketStartMs);
  // `bucket` spans the whole grid cell the activity sits in. `startTime` spans only the
  // reports that actually clustered, so a lone report is an instant rather than an hour.
  // Reports folded in by the OONI merge are deliberately excluded — their start can be up
  // to OONI_MATCH_WINDOW_MS away and would stretch the window past the outage it describes.
  const bucketEnd = isStartTimeAggregation(timeWindow)
    ? new Date(
        typeof row.lastOutageStartedAtMs === 'number'
          ? row.lastOutageStartedAtMs
          : row._id.bucketStartMs
      )
    : getBucketEndUtc(bucketStart, timeWindow.bucketSizeMinutes);
  const sources = getDistinctNonEmptyStrings(flattenArrayValues(row.mediaValues)).sort();
  const signals = getDistinctNonEmptyStrings(row.signalSourceValues).sort();
  const sourceCnt = sources.length;
  const signalCnt = signals.length;
  const incidentId = getSingleIncidentId(row.incidentValues);
  // A start-time activity spans whatever started together, so it has no single key of
  // its own; the sentinel keeps eventAggKey well-formed and unique on the cluster start.
  const eventAggKeyBase = isStartTimeAggregation(timeWindow)
    ? START_TIME_KEY_BASE
    : row._id.eventAggKeyBase;

  return {
    eventAggKey: buildEventAggKey({
      eventAggKeyBase,
      bucketStart,
      bucketSizeMinutes: timeWindow.bucketSizeMinutes,
      aggregationMethod: timeWindow.aggregationMethod,
      startTimeToleranceMinutes: timeWindow.startTimeToleranceMinutes,
    }),
    eventAggKeyBase,
    // Every key this activity actually covers — one under `bucket`, potentially many
    // under `startTime`.
    eventAggKeyBases: getDistinctNonEmptyStrings(row.eventAggKeyBaseValues || []).sort(),
    bucketStart,
    bucketEnd,
    bucketSizeMinutes: timeWindow.bucketSizeMinutes,
    sourceCnt,
    sources,
    signalCnt,
    signals,
    totalReports: row.totalReports || 0,
    reportIds: row.reportIds || [],
    reportBuckets: buildReportBuckets(row, timeWindow.bucketSizeMinutes),
    aggregationMethod: timeWindow.aggregationMethod || AGGREGATION_METHODS.TIME_BUCKET,
    isHighConfidence:
      sourceCnt >= HIGH_CONFIDENCE_MIN_COUNT ||
      signalCnt >= HIGH_CONFIDENCE_MIN_COUNT,
    // `asn`/`geoScope` stay single-valued (undefined when an activity covers several) for
    // callers that already read them. `asns`/`locations` carry the full picture, which is
    // the normal case once activities are no longer keyed by asn|geoScope.
    asn: getSingleDisplayValue(row.asnValues),
    geoScope: getSingleDisplayValue(row.geoScopeValues),
    asns: getDistinctNonEmptyStrings(row.asnValues || []).sort(),
    locations: getDistinctLocations(row.locationValues),
    incidentId,
  };
}

// Distinct "asn / region" labels, built from per-report pairs so an activity covering
// as1/regionA and as2/regionB never advertises the as1/regionB combination it never saw.
function getDistinctLocations(values) {
  if (!Array.isArray(values)) return [];

  const labels = values
    .map((value) => formatLocationLabel(value))
    .filter(Boolean);

  return [...new Set(labels)].sort();
}

function formatLocationLabel(value) {
  if (!value || typeof value !== 'object') return '';
  return getNonEmptyValues([value.asn, value.geoScope])
    .map((part) => part.toString())
    .join(' / ');
}

// Report counts per bucket of each report's own outageStartedAt, split by source. Always
// on the grid, whichever way the activity itself was grouped: the trend chart draws a
// fixed grid, and "View Reports" filters on the same bounds.
function buildReportBuckets(row, bucketSizeMinutes) {
  const bucketMs = bucketSizeMinutes * 60 * 1000;
  const mergedRows = row.mergedRows || [];

  return sumReportBuckets([
    ...ownReportBuckets(row, bucketMs, mergedRows),
    ...mergedRows.flatMap((mergedRow) => ownReportBuckets(mergedRow, bucketMs, [])),
  ]);
}

// One entry per report, placed by its own outage start. Falls back to the row's key for
// snapshots aggregated before startedAtPerReport existed.
function ownReportBuckets(row, bucketMs, mergedRows) {
  const media = row.mediaPerReport || [];
  const startedAt = row.startedAtPerReport || [];

  if (startedAt.length) {
    return startedAt.map((startedAtMs, index) => ({
      bucketStartMs: floorToBucketMs(startedAtMs, bucketMs),
      totalReports: 1,
      sourceCounts: { [normalizeSourceKey(media[index])]: 1 },
    }));
  }

  const mergedCount = mergedRows.reduce(
    (total, mergedRow) => total + (mergedRow.totalReports || 0),
    0
  );
  return [{
    bucketStartMs: floorToBucketMs(row._id.bucketStartMs, bucketMs),
    totalReports: media.length || (row.totalReports || 0) - mergedCount,
    sourceCounts: countSourcesPerReport(row),
  }];
}

function floorToBucketMs(timestampMs, bucketMs) {
  return timestampMs - (timestampMs % bucketMs);
}

// A report's source is its single `_media` entry; anything unexpected lands under
// `unknown` so the per-source lines still add up to the combined line.
function normalizeSourceKey(media) {
  const value = Array.isArray(media) ? media.find(Boolean) : media;
  return value ? String(value).trim().toLowerCase() : 'unknown';
}

function countSourcesPerReport(row) {
  const mediaPerReport = row.mediaPerReport || [];
  const counts = {};
  for (const media of mediaPerReport) {
    const key = normalizeSourceKey(media);
    counts[key] = (counts[key] || 0) + 1;
  }
  // Pre-`mediaPerReport` snapshots still yield a usable combined line.
  if (!mediaPerReport.length && row.totalReports) counts.unknown = row.totalReports;
  return counts;
}

function sumReportBuckets(entries) {
  const buckets = new Map();
  for (const { bucketStartMs, totalReports, sourceCounts } of entries) {
    if (!totalReports) continue;
    const current = buckets.get(bucketStartMs) || { totalReports: 0, sourceCounts: {} };
    current.totalReports += totalReports;
    for (const [source, count] of Object.entries(sourceCounts || {})) {
      current.sourceCounts[source] = (current.sourceCounts[source] || 0) + count;
    }
    buckets.set(bucketStartMs, current);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStartMs, bucket]) => ({
      bucketStart: new Date(bucketStartMs),
      totalReports: bucket.totalReports,
      sourceCounts: bucket.sourceCounts,
    }));
}

// The third segment identifies the grouping that produced this activity, so snapshots
// from the two methods can share a collection without ever colliding. The `bucket` form
// is left exactly as it was so existing snapshots and in-flight keys stay valid.
function buildEventAggKey({
  eventAggKeyBase,
  bucketStart,
  bucketSizeMinutes,
  aggregationMethod,
  startTimeToleranceMinutes,
}) {
  const grouping =
    aggregationMethod === AGGREGATION_METHODS.START_TIME
      ? `startTime:${startTimeToleranceMinutes}`
      : bucketSizeMinutes;

  return [
    eventAggKeyBase,
    bucketStart.toISOString(),
    grouping,
  ].join('|');
}

function compareNotableActivities(a, b) {
  if (b.sourceCnt !== a.sourceCnt) return b.sourceCnt - a.sourceCnt;
  if (b.signalCnt !== a.signalCnt) return b.signalCnt - a.signalCnt;
  if (b.totalReports !== a.totalReports) return b.totalReports - a.totalReports;
  return a.eventAggKey.localeCompare(b.eventAggKey);
}

function flattenArrayValues(values) {
  if (!Array.isArray(values)) return [];
  return values.reduce(function (acc, value) {
    if (Array.isArray(value)) return acc.concat(value);
    acc.push(value);
    return acc;
  }, []);
}

function getSingleDisplayValue(values) {
  if (!Array.isArray(values)) return undefined;
  const distinctValues = getNonEmptyValues(values);
  return distinctValues.length === 1 ? distinctValues[0] : undefined;
}

function getSingleIncidentId(values) {
  if (!Array.isArray(values)) return null;
  const hasUnassignedValue = values.some(
    (value) => value === null || typeof value === 'undefined' || value === ''
  );
  const distinctValues = getDistinctNonEmptyStrings(values);

  return !hasUnassignedValue && distinctValues.length === 1 ? distinctValues[0] : null;
}

function getNonEmptyValues(values) {
  return values.filter(function (value) {
    return value !== null && typeof value !== 'undefined' && value !== '';
  });
}

function getDistinctNonEmptyStrings(values) {
  return [...new Set(getNonEmptyValues(values).map(function (value) {
    return value.toString();
  }))];
}


function toDistinctSet(values) {
  const distinct = new Set();
  values.forEach(function (value) {
    if (value === null || typeof value === 'undefined' || value === '') {
      distinct.add(null);
      return;
    }
    distinct.add(value.toString());
  });
  return [...distinct];
}

function projectReportBuckets(activity, reports) {
  const bucketMs = activity.bucketSizeMinutes * 60 * 1000;
  const activityBucketMs = new Date(activity.bucketStart).getTime();
  return sumReportBuckets(reports.map((report) => {
    const startedAtMs = new Date(report.outageStartedAt).getTime();
    return {
      // Same flooring as the pipeline's $mod bucketing.
      bucketStartMs: Number.isNaN(startedAtMs)
        ? activityBucketMs
        : startedAtMs - (startedAtMs % bucketMs),
      totalReports: 1,
      sourceCounts: { [normalizeSourceKey(report._media)]: 1 },
    };
  }));
}

// Re-derive a notable activity's fields from a subset of its reports.
function projectNotableActivityToReports(activity, reports) {
  if (!Array.isArray(reports) || reports.length === 0) return null;

  const sources = getDistinctNonEmptyStrings(
    flattenArrayValues(reports.map((report) => report._media))
  ).sort();
  const signals = getDistinctNonEmptyStrings(
    reports.map((report) => {
      const metadata = report.metadata || {};
      const rawAPIResponse = metadata.rawAPIResponse || {};
      return rawAPIResponse.dataSource;
    })
  ).sort();
  const sourceCnt = sources.length;
  const signalCnt = signals.length;

  return {
    ...activity,
    sourceCnt,
    sources,
    signalCnt,
    signals,
    totalReports: reports.length,
    reportIds: reports.map((report) => report._id),
    reportBuckets: projectReportBuckets(activity, reports),
    isHighConfidence:
      sourceCnt >= HIGH_CONFIDENCE_MIN_COUNT ||
      signalCnt >= HIGH_CONFIDENCE_MIN_COUNT,
    asn: getSingleDisplayValue(
      getDistinctNonEmptyStrings(reports.map((report) => report.asn))
    ),
    geoScope: getSingleDisplayValue(
      getDistinctNonEmptyStrings(reports.map((report) => report.geoScope))
    ),
    asns: getDistinctNonEmptyStrings(reports.map((report) => report.asn)).sort(),
    locations: getDistinctLocations(
      reports.map((report) => ({ asn: report.asn, geoScope: report.geoScope }))
    ),
    eventAggKeyBases: getDistinctNonEmptyStrings(
      reports.map((report) => report.eventAggKeyBase)
    ).sort(),
    incidentId: getSingleIncidentId(
      toDistinctSet(reports.map((report) => report._group))
    ),
  };
}

module.exports = {
  HIGH_CONFIDENCE_MIN_COUNT,
  OONI_MATCH_WINDOW_MS,
  buildOutageReportMatch,
  clusterRowsByStartTime,
  mergeOoniRows,
  formatNotableActivity,
  aggregateNotableActivities,
  buildEventAggKey,
  compareNotableActivities,
  projectNotableActivityToReports,
};
