'use strict';

const Report = require('../../models/report');
const {
  getBucketEndUtc,
  resolveAnalyticsTimeWindow,
} = require('./analyticsTime');

const HIGH_CONFIDENCE_MIN_COUNT = 2;

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
  const bucketMs = timeWindow.bucketSizeMinutes * 60 * 1000;
  const match = buildOutageReportMatch(timeWindow);

  const pipeline = [
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
        },
        totalReports: { $sum: 1 },
        reportIds: { $push: '$_id' },
        mediaValues: { $addToSet: '$_media' },
        signalSourceValues: { $addToSet: '$metadata.rawAPIResponse.dataSource' },
        asnValues: { $addToSet: '$asn' },
        geoScopeValues: { $addToSet: '$geoScope' },
        incidentValues: { $addToSet: '$_group' },
      },
    },
  ];

  const rows = await Report.aggregate(pipeline).exec();
  const notableActivities = rows.map((row) => formatNotableActivity(row, timeWindow));

  notableActivities.sort(compareNotableActivities);

  if (typeof options.limit === 'number' && options.limit >= 0) {
    return notableActivities.slice(0, options.limit);
  }

  return notableActivities;
}

function formatNotableActivity(row, timeWindow) {
  const bucketStart = new Date(row._id.bucketStartMs);
  const bucketEnd = getBucketEndUtc(bucketStart, timeWindow.bucketSizeMinutes);
  const sourceCnt = countDistinct(flattenArrayValues(row.mediaValues));
  const signalCnt = countDistinct(row.signalSourceValues);
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
    signalCnt,
    totalReports: row.totalReports || 0,
    reportIds: row.reportIds || [],
    isHighConfidence:
      sourceCnt >= HIGH_CONFIDENCE_MIN_COUNT ||
      signalCnt >= HIGH_CONFIDENCE_MIN_COUNT,
    asn: getSingleDisplayValue(row.asnValues),
    geoScope: getSingleDisplayValue(row.geoScopeValues),
    incidentId,
  };
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
  return values.reduce((acc, value) => {
    if (Array.isArray(value)) return acc.concat(value);
    acc.push(value);
    return acc;
  }, []);
}

function countDistinct(values) {
  if (!Array.isArray(values)) return 0;
  return new Set(
    values
      .filter((value) => value !== null && typeof value !== 'undefined' && value !== '')
      .map((value) => value.toString())
  ).size;
}

function getSingleDisplayValue(values) {
  if (!Array.isArray(values)) return undefined;
  const distinctValues = values.filter(
    (value) => value !== null && typeof value !== 'undefined' && value !== ''
  );
  return distinctValues.length === 1 ? distinctValues[0] : undefined;
}

function getSingleIncidentId(values) {
  if (!Array.isArray(values)) return null;
  const hasUnassignedValue = values.some(
    (value) => value === null || typeof value === 'undefined' || value === ''
  );
  const distinctValues = [
    ...new Set(
      values
        .filter((value) => value !== null && typeof value !== 'undefined' && value !== '')
        .map((value) => value.toString())
    ),
  ];

  return !hasUnassignedValue && distinctValues.length === 1 ? distinctValues[0] : null;
}

module.exports = {
  HIGH_CONFIDENCE_MIN_COUNT,
  buildOutageReportMatch,
  aggregateNotableActivities,
  buildEventAggKey,
  compareNotableActivities,
};
