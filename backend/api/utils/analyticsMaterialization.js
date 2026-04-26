'use strict';

const NotableActivity = require('../../models/notableActivity');
const AnalyticsAggregationCache = require('../../models/analyticsAggregationCache');
const {
  aggregateNotableActivities,
  compareNotableActivities,
} = require('./analyticsAggregation');
const {
  DEFAULT_REFRESH_SNAP_MINUTES,
  resolveAnalyticsTimeWindow,
} = require('./analyticsTime');

const DEFAULT_CACHE_TTL_MINUTES = DEFAULT_REFRESH_SNAP_MINUTES;

async function getMaterializedNotableActivities(options = {}) {
  const timeWindow = options.timeWindow || resolveAnalyticsTimeWindow(options);
  const filters = normalizeFilters(options.filters);
  const cacheKey = options.cacheKey || buildAnalyticsCacheKey(timeWindow, filters);
  const now = normalizeDate(options.now || new Date(), 'now');
  const forceRefresh = options.forceRefresh === true;

  const cachedWindow = forceRefresh
    ? null
    : await findFreshAnalyticsCache(cacheKey, now);

  if (cachedWindow) {
    const cachedActivities = await findCachedNotableActivities(cacheKey, now);
    if (cachedActivities.length === cachedWindow.resultCount) {
      return buildMaterializedResponse({
        timeWindow,
        cacheKey,
        notableActivities: cachedActivities,
        computedAt: cachedWindow.computedAt,
        expiresAt: cachedWindow.expiresAt,
        cacheStatus: 'hit',
      });
    }
  }

  const notableActivities = await aggregateNotableActivities({
    ...options,
    timeWindow,
  });
  const computedAt = now;
  const expiresAt = getExpiresAt(computedAt, options.cacheTtlMinutes);

  await replaceCachedNotableActivities({
    cacheKey,
    timeWindow,
    notableActivities,
    computedAt,
    expiresAt,
  });

  await upsertAnalyticsCacheWindow({
    cacheKey,
    timeWindow,
    filters,
    resultCount: notableActivities.length,
    computedAt,
    expiresAt,
  });

  return buildMaterializedResponse({
    timeWindow,
    cacheKey,
    notableActivities,
    computedAt,
    expiresAt,
    cacheStatus: 'miss',
  });
}

async function findCachedNotableActivities(cacheKey, now = new Date()) {
  const rows = await NotableActivity.find({
    cacheKey,
    expiresAt: { $gt: now },
  }).lean().exec();

  return rows.sort(compareNotableActivities);
}

async function replaceCachedNotableActivities({
  cacheKey,
  timeWindow,
  notableActivities,
  computedAt,
  expiresAt,
}) {
  const docs = buildCachedNotableActivityDocs({
    notableActivities,
    cacheKey,
    timeWindow,
    computedAt,
    expiresAt,
  });

  if (!docs.length) {
    await NotableActivity.deleteMany({ cacheKey }).exec();
    return;
  }

  await NotableActivity.bulkWrite(
    docs.map((doc) => ({
      updateOne: {
        filter: {
          cacheKey: doc.cacheKey,
          eventAggKey: doc.eventAggKey,
        },
        update: { $set: doc },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const currentEventAggKeys = docs.map(function (doc) {
    return doc.eventAggKey;
  });
  await NotableActivity.deleteMany({
    cacheKey,
    eventAggKey: { $nin: currentEventAggKeys },
  }).exec();
}

async function findFreshAnalyticsCache(cacheKey, now) {
  return AnalyticsAggregationCache.findOne({
    cacheKey,
    expiresAt: { $gt: now },
  }).lean().exec();
}

async function upsertAnalyticsCacheWindow({
  cacheKey,
  timeWindow,
  filters,
  resultCount,
  computedAt,
  expiresAt,
}) {
  return AnalyticsAggregationCache.findOneAndUpdate(
    { cacheKey },
    {
      $set: {
        cacheKey,
        rangePreset: timeWindow.rangePreset,
        rangeStart: timeWindow.rangeStartUtc,
        rangeEnd: timeWindow.rangeEndUtc,
        bucketSizeMinutes: timeWindow.bucketSizeMinutes,
        filters,
        resultCount,
        computedAt,
        expiresAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
}

function buildCachedNotableActivityDocs({
  notableActivities,
  cacheKey,
  timeWindow,
  computedAt,
  expiresAt,
}) {
  return notableActivities.map(function (activity) {
    return {
      ...activity,
      cacheKey,
      rangePreset: timeWindow.rangePreset,
      rangeStart: timeWindow.rangeStartUtc,
      rangeEnd: timeWindow.rangeEndUtc,
      computedAt,
      expiresAt,
    };
  });
}

function buildMaterializedResponse({
  timeWindow,
  cacheKey,
  notableActivities,
  computedAt,
  expiresAt,
  cacheStatus,
}) {
  return {
    cacheKey,
    cacheStatus,
    computedAt,
    expiresAt,
    rangePreset: timeWindow.rangePreset,
    bucketPreset: timeWindow.bucketPreset,
    bucketSizeMinutes: timeWindow.bucketSizeMinutes,
    rangeStartUtc: timeWindow.rangeStartUtc,
    rangeEndUtc: timeWindow.rangeEndUtc,
    notableActivities,
    highConfidenceActivities: notableActivities.filter(
      (activity) => activity.isHighConfidence
    ),
  };
}

function buildAnalyticsCacheKey(timeWindow, filters = {}) {
  return JSON.stringify({
    rangePreset: timeWindow.rangePreset,
    rangeStartUtc: timeWindow.rangeStartUtc.toISOString(),
    rangeEndUtc: timeWindow.rangeEndUtc.toISOString(),
    bucketSizeMinutes: timeWindow.bucketSizeMinutes,
    filters: normalizeFilters(filters),
  });
}

function getExpiresAt(computedAt, cacheTtlMinutes) {
  const ttlMinutes = Number(cacheTtlMinutes || DEFAULT_CACHE_TTL_MINUTES);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error('cacheTtlMinutes must be a positive number');
  }
  return new Date(computedAt.getTime() + ttlMinutes * 60 * 1000);
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== 'object') return {};

  return Object.keys(filters)
    .sort()
    .reduce(function (normalized, key) {
      const value = filters[key];
      if (typeof value === 'undefined' || value === null || value === '') {
        return normalized;
      }
      normalized[key] = value;
      return normalized;
    }, {});
}

function normalizeDate(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return date;
}

module.exports = {
  DEFAULT_CACHE_TTL_MINUTES,
  buildAnalyticsCacheKey,
  getMaterializedNotableActivities,
  findCachedNotableActivities,
  replaceCachedNotableActivities,
  findFreshAnalyticsCache,
};
