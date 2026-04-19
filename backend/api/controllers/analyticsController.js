'use strict';

const {
  getMaterializedNotableActivities,
} = require('../utils/analyticsMaterialization');
const {
  getBucketEndUtc,
  getBucketStartUtc,
} = require('../utils/analyticsTime');

exports.analytics_notable_activities = async (req, res) => {
  try {
    const data = await getMaterializedNotableActivities(
      parseAnalyticsQuery(req.query, { allowLimit: true })
    );
    return res.status(200).send(data);
  } catch (err) {
    return handleAnalyticsError(res, err, 'Error fetching notable activities');
  }
};

exports.analytics_overview = async (req, res) => {
  try {
    const data = await getMaterializedNotableActivities(parseAnalyticsQuery(req.query));
    return res.status(200).send({
      cacheKey: data.cacheKey,
      cacheStatus: data.cacheStatus,
      computedAt: data.computedAt,
      expiresAt: data.expiresAt,
      rangePreset: data.rangePreset,
      bucketPreset: data.bucketPreset,
      bucketSizeMinutes: data.bucketSizeMinutes,
      rangeStartUtc: data.rangeStartUtc,
      rangeEndUtc: data.rangeEndUtc,
      metrics: {
        notableActivityCount: data.notableActivities.length,
        highConfidenceActivityCount: data.highConfidenceActivities.length,
        totalReports: sumReports(data.notableActivities),
      },
      timeSeries: buildActivityTimeSeries(data),
    });
  } catch (err) {
    return handleAnalyticsError(res, err, 'Error fetching analytics overview');
  }
};

function parseAnalyticsQuery(query = {}, parseOptions = {}) {
  const analyticsOptions = {
    range: query.range,
    bucket: query.bucket,
  };

  if (parseOptions.allowLimit && query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 0) {
      throw Object.assign(new Error('limit must be a non-negative integer'), {
        status: 400,
      });
    }
    analyticsOptions.limit = limit;
  }

  return analyticsOptions;
}

function buildActivityTimeSeries(data) {
  const notableActivities = data.notableActivities || [];
  const buckets = new Map();
  let cursor = getBucketStartUtc(data.rangeStartUtc, data.bucketSizeMinutes);
  const rangeEnd = new Date(data.rangeEndUtc);

  while (cursor < rangeEnd) {
    const bucketStart = cursor;
    const bucketEnd = getBucketEndUtc(bucketStart, data.bucketSizeMinutes);
    buckets.set(bucketStart.toISOString(), {
      bucketStart,
      bucketEnd,
      totalReports: 0,
      notableActivityCount: 0,
      highConfidenceActivityCount: 0,
    });
    cursor = bucketEnd;
  }

  for (const activity of notableActivities) {
    const bucketKey = new Date(activity.bucketStart).toISOString();
    const current = buckets.get(bucketKey) || {
      bucketStart: activity.bucketStart,
      bucketEnd: activity.bucketEnd,
      totalReports: 0,
      notableActivityCount: 0,
      highConfidenceActivityCount: 0,
    };

    current.totalReports += activity.totalReports || 0;
    current.notableActivityCount += 1;
    if (activity.isHighConfidence) current.highConfidenceActivityCount += 1;
    buckets.set(bucketKey, current);
  }

  return [...buckets.values()].sort(
    (a, b) => new Date(a.bucketStart).getTime() - new Date(b.bucketStart).getTime()
  );
}

function sumReports(notableActivities) {
  return notableActivities.reduce(
    (total, activity) => total + (activity.totalReports || 0),
    0
  );
}

function handleAnalyticsError(res, err, fallbackMessage) {
  const status = err.status || (isValidationError(err) ? 400 : 500);
  if (status >= 500) {
    console.error(fallbackMessage, err);
  }
  return res.status(status).send(err.message || fallbackMessage);
}

function isValidationError(err) {
  return Boolean(
    err &&
    typeof err.message === 'string' &&
    err.message.startsWith('Unsupported analytics')
  );
}
