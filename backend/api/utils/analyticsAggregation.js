'use strict';

const {
  getBucketEndUtc,
  resolveAnalyticsTimeWindow,
} = require('./analyticsTime');

const HIGH_CONFIDENCE_MIN_COUNT = 2;

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
  const pipeline = buildAggregationPipeline(match, timeWindow.bucketSizeMinutes);

  const Report = require('../../models/report');
  const rows = mergeOoniRows(await Report.aggregate(pipeline).exec());
  const notableActivities = rows.map(function (row) {
    return formatNotableActivity(row, timeWindow);
  });

  notableActivities.sort(compareNotableActivities);

  if (typeof options.limit === 'number' && options.limit >= 0) {
    return notableActivities.slice(0, options.limit);
  }

  return notableActivities;
}

function buildAggregationPipeline(match, bucketSizeMinutes) {
  const bucketMs = bucketSizeMinutes * 60 * 1000;

  return [
    { $match: match },
    {
      $addFields: {
        outageStartedAtMs: { $toLong: '$outageStartedAt' },
      },
    },
    {
      $addFields: {
        bucketStartMs: {
          $subtract: [
            '$outageStartedAtMs',
            { $mod: ['$outageStartedAtMs', bucketMs] },
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          eventAggKeyBase: '$eventAggKeyBase',
          bucketStartMs: '$bucketStartMs',
          isOoni: {
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
        signalSourceValues: { $addToSet: '$metadata.rawAPIResponse.dataSource' },
        asnValues: { $addToSet: '$asn' },
        geoScopeValues: { $addToSet: '$geoScope' },
        incidentValues: { $addToSet: '$_group' },
        firstOutageStartedAtMs: { $min: '$outageStartedAtMs' },
        lastOutageStartedAtMs: { $max: '$outageStartedAtMs' },
        // ISO strings, so $min picks the earliest. Only OONI reports carry one.
        ooniWindowStart: { $min: '$metadata.rawAPIResponse.windowStart' },
      },
    },
  ];
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
    target.extraReportBuckets = (target.extraReportBuckets || []).concat({
      bucketStartMs: row._id.bucketStartMs,
      totalReports: row.totalReports || 0,
      sourceCounts: countSourcesPerReport(row),
    });
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
  const bucketEnd = getBucketEndUtc(bucketStart, timeWindow.bucketSizeMinutes);
  const sources = getDistinctNonEmptyStrings(flattenArrayValues(row.mediaValues)).sort();
  const signals = getDistinctNonEmptyStrings(row.signalSourceValues).sort();
  const sourceCnt = sources.length;
  const signalCnt = signals.length;
  const incidentId = getSingleIncidentId(row.incidentValues);

  return {
    eventAggKey: buildEventAggKey({
      eventAggKeyBase: row._id.eventAggKeyBase,
      bucketStart,
      bucketSizeMinutes: timeWindow.bucketSizeMinutes,
    }),
    eventAggKeyBase: row._id.eventAggKeyBase,
    bucketStart,
    bucketEnd,
    bucketSizeMinutes: timeWindow.bucketSizeMinutes,
    sourceCnt,
    sources,
    signalCnt,
    signals,
    totalReports: row.totalReports || 0,
    reportIds: row.reportIds || [],
    reportBuckets: buildReportBuckets(row),
    isHighConfidence:
      sourceCnt >= HIGH_CONFIDENCE_MIN_COUNT ||
      signalCnt >= HIGH_CONFIDENCE_MIN_COUNT,
    asn: getSingleDisplayValue(row.asnValues),
    geoScope: getSingleDisplayValue(row.geoScopeValues),
    incidentId,
  };
}

// Report counts per bucket of each report's own outageStartedAt, split by source. 
function buildReportBuckets(row) {
  const extras = row.extraReportBuckets || [];
  const ownMedia = row.mediaPerReport || [];
  const ownCount = ownMedia.length ||
    (row.totalReports || 0) - extras.reduce((total, bucket) => total + bucket.totalReports, 0);

  return sumReportBuckets([
    {
      bucketStartMs: row._id.bucketStartMs,
      totalReports: ownCount,
      sourceCounts: countSourcesPerReport(row),
    },
    ...extras,
  ]);
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

function buildEventAggKey({ eventAggKeyBase, bucketStart, bucketSizeMinutes }) {
  return [
    eventAggKeyBase,
    bucketStart.toISOString(),
    bucketSizeMinutes,
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
    incidentId: getSingleIncidentId(
      toDistinctSet(reports.map((report) => report._group))
    ),
  };
}

module.exports = {
  HIGH_CONFIDENCE_MIN_COUNT,
  OONI_MATCH_WINDOW_MS,
  buildOutageReportMatch,
  mergeOoniRows,
  formatNotableActivity,
  aggregateNotableActivities,
  buildEventAggKey,
  compareNotableActivities,
  projectNotableActivityToReports,
};
