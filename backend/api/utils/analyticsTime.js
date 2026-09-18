'use strict';
// time bucket configs and formatting helpers for analytical dashboard

const RANGE_PRESETS = Object.freeze({
  TODAY: 'today',
  LAST_24H: 'last24h',
  LAST_7D: 'last7d',
});

const BUCKET_PRESETS = Object.freeze({
  THIRTY_MINUTES: '30m',
  ONE_HOUR: '1h',
  SIX_HOURS: '6h',
  TWENTY_FOUR_HOURS: '24h',
});

const BUCKET_SIZE_MINUTES = Object.freeze({
  [BUCKET_PRESETS.THIRTY_MINUTES]: 30,
  [BUCKET_PRESETS.ONE_HOUR]: 60,
  [BUCKET_PRESETS.SIX_HOURS]: 6 * 60,
  [BUCKET_PRESETS.TWENTY_FOUR_HOURS]: 24 * 60,
});

const VALID_BUCKETS_BY_RANGE = Object.freeze({
  [RANGE_PRESETS.TODAY]: [
    BUCKET_PRESETS.THIRTY_MINUTES,
    BUCKET_PRESETS.ONE_HOUR,
    BUCKET_PRESETS.SIX_HOURS,
  ],
  [RANGE_PRESETS.LAST_24H]: [
    BUCKET_PRESETS.THIRTY_MINUTES,
    BUCKET_PRESETS.ONE_HOUR,
    BUCKET_PRESETS.SIX_HOURS,
  ],
  [RANGE_PRESETS.LAST_7D]: [
    BUCKET_PRESETS.SIX_HOURS,
    BUCKET_PRESETS.TWENTY_FOUR_HOURS,
  ],
});

// How reports are grouped into a notable activity. `bucket` floors each report's
// outageStartedAt onto a fixed grid of bucketSizeMinutes. `startTime` ignores the grid
// and clusters reports whose outages started within START_TIME tolerance of each other,
// on the premise that alerts sharing a start time describe the same incident. Both are
// selectable so the two can be compared side by side.
const AGGREGATION_METHODS = Object.freeze({
  TIME_BUCKET: 'bucket',
  START_TIME: 'startTime',
});

const DEFAULT_AGGREGATION_METHOD = AGGREGATION_METHODS.TIME_BUCKET;

const DEFAULT_START_TIME_TOLERANCE_MINUTES = 5;
const MAX_START_TIME_TOLERANCE_MINUTES = 24 * 60;

const DEFAULT_RANGE_PRESET = RANGE_PRESETS.TODAY;
const DEFAULT_BUCKET_PRESET = BUCKET_PRESETS.ONE_HOUR;
const DEFAULT_REFRESH_SNAP_MINUTES = 5;

function floorDateToMinutes(date, minutes) {
  const dateValue = normalizeDate(date, 'date');
  const minuteValue = Number(minutes);

  if (!Number.isFinite(minuteValue) || minuteValue <= 0) {
    throw new Error('minutes must be a positive number');
  }

  const intervalMs = minuteValue * 60 * 1000;
  return new Date(Math.floor(dateValue.getTime() / intervalMs) * intervalMs);
}

function getUtcStartOfDay(date) {
  const dateValue = normalizeDate(date, 'date');
  return new Date(Date.UTC(
    dateValue.getUTCFullYear(),
    dateValue.getUTCMonth(),
    dateValue.getUTCDate(),
    0,
    0,
    0,
    0
  ));
}

function getBucketStartUtc(date, bucketSizeMinutes) {
  return floorDateToMinutes(date, bucketSizeMinutes);
}

function getBucketEndUtc(bucketStart, bucketSizeMinutes) {
  const start = normalizeDate(bucketStart, 'bucketStart');
  return new Date(start.getTime() + bucketSizeMinutes * 60 * 1000);
}

function getBucketSizeMinutes(bucketPreset) {
  const bucketSizeMinutes = BUCKET_SIZE_MINUTES[bucketPreset];
  if (!bucketSizeMinutes) {
    throw new Error(`Unsupported analytics bucket preset: ${bucketPreset}`);
  }
  return bucketSizeMinutes;
}

function isStartTimeAggregation(timeWindow) {
  return Boolean(
    timeWindow &&
    timeWindow.aggregationMethod === AGGREGATION_METHODS.START_TIME
  );
}

function normalizeAggregationMethod(value) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return DEFAULT_AGGREGATION_METHOD;
  }
  const isSupported = Object.keys(AGGREGATION_METHODS).some(
    (key) => AGGREGATION_METHODS[key] === value
  );
  if (!isSupported) {
    throw new Error(`Unsupported analytics aggregation method: ${value}`);
  }
  return value;
}

function normalizeStartTimeToleranceMinutes(value) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return DEFAULT_START_TIME_TOLERANCE_MINUTES;
  }
  const minutes = Number(value);
  if (
    !Number.isFinite(minutes) ||
    minutes < 0 ||
    minutes > MAX_START_TIME_TOLERANCE_MINUTES
  ) {
    throw new Error(
      `Unsupported analytics start-time tolerance: ${value} ` +
      `(expected 0-${MAX_START_TIME_TOLERANCE_MINUTES} minutes)`
    );
  }
  return minutes;
}

function isSupportedRangeBucket(rangePreset, bucketPreset) {
  return Boolean(
    VALID_BUCKETS_BY_RANGE[rangePreset] &&
    VALID_BUCKETS_BY_RANGE[rangePreset].includes(bucketPreset)
  );
}

function resolveAnalyticsTimeWindow(options = {}) {
  const rangePreset = options.range || DEFAULT_RANGE_PRESET;
  const bucketPreset = options.bucket || DEFAULT_BUCKET_PRESET;
  const now = options.now || new Date();
  const refreshSnapMinutes = options.refreshSnapMinutes || DEFAULT_REFRESH_SNAP_MINUTES;

  if (!VALID_BUCKETS_BY_RANGE[rangePreset]) {
    throw new Error(`Unsupported analytics range preset: ${rangePreset}`);
  }

  if (!isSupportedRangeBucket(rangePreset, bucketPreset)) {
    throw new Error(
      `Unsupported analytics bucket preset "${bucketPreset}" for range "${rangePreset}"`
    );
  }

  const bucketSizeMinutes = getBucketSizeMinutes(bucketPreset);
  const aggregationMethod = normalizeAggregationMethod(options.aggregationMethod);
  const startTimeToleranceMinutes = normalizeStartTimeToleranceMinutes(
    options.startTimeToleranceMinutes
  );
  const rangeEndUtc = floorDateToMinutes(now, refreshSnapMinutes);
  let rangeStartUtc;

  if (rangePreset === RANGE_PRESETS.TODAY) {
    rangeStartUtc = getUtcStartOfDay(rangeEndUtc);
  } else if (rangePreset === RANGE_PRESETS.LAST_24H) {
    rangeStartUtc = new Date(rangeEndUtc.getTime() - 24 * 60 * 60 * 1000);
  } else if (rangePreset === RANGE_PRESETS.LAST_7D) {
    rangeStartUtc = new Date(rangeEndUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return {
    rangePreset,
    bucketPreset,
    bucketSizeMinutes,
    aggregationMethod,
    startTimeToleranceMinutes,
    rangeStartUtc,
    rangeEndUtc,
    refreshSnapMinutes,
  };
}

function normalizeDate(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return date;
}

module.exports = {
  RANGE_PRESETS,
  BUCKET_PRESETS,
  AGGREGATION_METHODS,
  DEFAULT_AGGREGATION_METHOD,
  DEFAULT_START_TIME_TOLERANCE_MINUTES,
  MAX_START_TIME_TOLERANCE_MINUTES,
  isStartTimeAggregation,
  normalizeAggregationMethod,
  normalizeStartTimeToleranceMinutes,
  BUCKET_SIZE_MINUTES,
  VALID_BUCKETS_BY_RANGE,
  DEFAULT_RANGE_PRESET,
  DEFAULT_BUCKET_PRESET,
  DEFAULT_REFRESH_SNAP_MINUTES,
  floorDateToMinutes,
  getUtcStartOfDay,
  getBucketStartUtc,
  getBucketEndUtc,
  getBucketSizeMinutes,
  isSupportedRangeBucket,
  resolveAnalyticsTimeWindow,
};
