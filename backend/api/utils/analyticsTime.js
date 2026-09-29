'use strict';
// time bucket configs and formatting helpers for analytical dashboard

const RANGE_PRESETS = Object.freeze({
  TODAY: 'today',
  LAST_24H: 'last24h',
  LAST_7D: 'last7d',
  // Caller-supplied `from`/`to`; its valid buckets depend on the span (see below).
  CUSTOM: 'custom',
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
    BUCKET_PRESETS.ONE_HOUR,
    BUCKET_PRESETS.SIX_HOURS,
  ],
  [RANGE_PRESETS.LAST_7D]: [
    BUCKET_PRESETS.SIX_HOURS,
    BUCKET_PRESETS.TWENTY_FOUR_HOURS,
  ],
});

// A custom range gets the bucket sizes of the preset closest to its length, so the chart
// stays between ~4 and ~100 points. Mirrored by the dashboard's custom-range controls.
const CUSTOM_BUCKETS_BY_MAX_SPAN_DAYS = Object.freeze([
  {
    maxSpanDays: 2,
    buckets: [
      BUCKET_PRESETS.THIRTY_MINUTES,
      BUCKET_PRESETS.ONE_HOUR,
      BUCKET_PRESETS.SIX_HOURS,
    ],
  },
  {
    maxSpanDays: 14,
    buckets: [BUCKET_PRESETS.SIX_HOURS, BUCKET_PRESETS.TWENTY_FOUR_HOURS],
  },
  { maxSpanDays: Infinity, buckets: [BUCKET_PRESETS.TWENTY_FOUR_HOURS] },
]);

// Longest custom range accepted. Bounds the aggregation (every report in the window is
// grouped in one pipeline) and the start-time clustering that runs over its result.
const MAX_CUSTOM_RANGE_DAYS = 31;
const MAX_RANGE_MS = MAX_CUSTOM_RANGE_DAYS * 24 * 60 * 60 * 1000;

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

const DEFAULT_START_TIME_TOLERANCE_MINUTES = 60;
const MAX_START_TIME_TOLERANCE_MINUTES = 24 * 60;

const DEFAULT_RANGE_PRESET = RANGE_PRESETS.TODAY;
const DEFAULT_BUCKET_PRESET = BUCKET_PRESETS.ONE_HOUR;
const DEFAULT_REFRESH_SNAP_MINUTES = 5;
const DEFAULT_TIME_ZONE = 'UTC';

// Every UTC offset in use is a whole number of quarter hours, so every bucket edge in any
// zone falls on one of these. The pipeline groups on them; the grid is applied in JS.
const TIME_ZONE_GRANULARITY_MS = 15 * 60 * 1000;

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

const offsetFormatters = new Map();
// Offsets only change on quarter-hour boundaries, so one lookup per quarter hour serves
// every report in it; the chart floors one timestamp per report.
const offsetCache = new Map();
const MAX_OFFSET_CACHE_ENTRIES = 50000;

function getOffsetFormatter(timeZone) {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(timeZone, formatter);
  }
  return formatter;
}

// Milliseconds to add to a UTC instant to get the wall-clock time in `timeZone`.
function getTimeZoneOffsetMs(ms, timeZone) {
  if (timeZone === DEFAULT_TIME_ZONE) return 0;

  const slot = Math.floor(ms / TIME_ZONE_GRANULARITY_MS);
  const cacheKey = `${timeZone}|${slot}`;
  const cached = offsetCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const slotMs = slot * TIME_ZONE_GRANULARITY_MS;
  const parts = {};
  for (const part of getOffsetFormatter(timeZone).formatToParts(new Date(slotMs))) {
    parts[part.type] = part.value;
  }
  const wallMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = wallMs - slotMs;

  if (offsetCache.size >= MAX_OFFSET_CACHE_ENTRIES) offsetCache.clear();
  offsetCache.set(cacheKey, offsetMs);
  return offsetMs;
}

function toWallClockMs(ms, timeZone) {
  return ms + getTimeZoneOffsetMs(ms, timeZone);
}

function fromWallClockMs(wallMs, timeZone) {
  // The offset belongs to the instant being solved for, which is not yet known; the second
  // pass settles it on the right side of a DST change.
  const guess = wallMs - getTimeZoneOffsetMs(wallMs, timeZone);
  return wallMs - getTimeZoneOffsetMs(guess, timeZone);
}

// Start of the grid bucket containing `ms`, with the grid laid out in wall-clock time in
// `timeZone`. Across a DST change a day bucket is 23 or 25 hours long, not shifted.
function floorToBucketStartMs(ms, bucketSizeMinutes, timeZone = DEFAULT_TIME_ZONE) {
  const bucketMs = bucketSizeMinutes * 60 * 1000;
  if (timeZone === DEFAULT_TIME_ZONE) return ms - mod(ms, bucketMs);

  const wallMs = toWallClockMs(ms, timeZone);
  const floorWallMs = wallMs - mod(wallMs, bucketMs);
  // Try the instant's own offset first: when clocks fall back a wall time happens twice,
  // and this picks the occurrence the instant is actually in.
  const ownOffsetStart = floorWallMs - getTimeZoneOffsetMs(ms, timeZone);
  if (ownOffsetStart <= ms && toWallClockMs(ownOffsetStart, timeZone) === floorWallMs) {
    return ownOffsetStart;
  }
  const start = fromWallClockMs(floorWallMs, timeZone);
  // Defensive: a bucket must never start after the instant it holds.
  return start <= ms ? start : ms - mod(ms, bucketMs);
}

function getBucketStartUtc(date, bucketSizeMinutes, timeZone = DEFAULT_TIME_ZONE) {
  const dateValue = normalizeDate(date, 'date');
  return new Date(floorToBucketStartMs(dateValue.getTime(), bucketSizeMinutes, timeZone));
}

function getBucketEndUtc(bucketStart, bucketSizeMinutes, timeZone = DEFAULT_TIME_ZONE) {
  const start = normalizeDate(bucketStart, 'bucketStart').getTime();
  const bucketMs = bucketSizeMinutes * 60 * 1000;
  if (timeZone === DEFAULT_TIME_ZONE) return new Date(start + bucketMs);

  // The end is the next grid start. Stepping the wall clock finds it except around a DST
  // change: in a repeated hour it can skip the second occurrence, and in a skipped hour it
  // can land before the start. Flooring one bucket-length later catches the first case.
  const candidates = [
    fromWallClockMs(toWallClockMs(start, timeZone) + bucketMs, timeZone),
    floorToBucketStartMs(start + bucketMs, bucketSizeMinutes, timeZone),
  ].filter((candidate) => candidate > start);
  // The time series walks bucket ends, so it must always move forward.
  return new Date(candidates.length ? Math.min(...candidates) : start + bucketMs);
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

// Accepts any IANA zone name and returns its canonical spelling, so the same zone always
// produces the same cache key.
function normalizeTimeZone(value) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return DEFAULT_TIME_ZONE;
  }
  if (typeof value !== 'string' || value.length > 64) {
    throw new Error(`Unsupported analytics time zone: ${value}`);
  }
  let resolved;
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone: value })
      .resolvedOptions()
      .timeZone;
  } catch (err) {
    throw new Error(`Unsupported analytics time zone: ${value}`);
  }
  return resolved === 'Etc/UTC' || resolved === 'Etc/GMT' ? DEFAULT_TIME_ZONE : resolved;
}

function isSupportedRangePreset(rangePreset) {
  return Object.keys(RANGE_PRESETS).some((key) => RANGE_PRESETS[key] === rangePreset);
}

function getValidBucketPresets(rangePreset, rangeStartUtc, rangeEndUtc) {
  if (rangePreset !== RANGE_PRESETS.CUSTOM) {
    return VALID_BUCKETS_BY_RANGE[rangePreset] || [];
  }
  const spanDays =
    (new Date(rangeEndUtc).getTime() - new Date(rangeStartUtc).getTime()) /
    (24 * 60 * 60 * 1000);
  return CUSTOM_BUCKETS_BY_MAX_SPAN_DAYS.find((entry) => spanDays <= entry.maxSpanDays)
    .buckets;
}

function isSupportedRangeBucket(rangePreset, bucketPreset) {
  return Boolean(
    VALID_BUCKETS_BY_RANGE[rangePreset] &&
    VALID_BUCKETS_BY_RANGE[rangePreset].includes(bucketPreset)
  );
}

function parseCustomRangeDate(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(
      `Unsupported analytics custom range: ${fieldName} must be a valid date`
    );
  }
  return date;
}

// A custom range may reach into the future (a day picker's "through today"); it is cut
// at the same snapped "now" the presets end on, so its cache key and live refresh match.
// Its length limit and bucket sizes go by the range as requested, so a range that runs
// through today keeps the same bucket choices while "now" moves.
function resolveCustomRange(from, to, latestEndUtc) {
  const rangeStartUtc = parseCustomRangeDate(from, 'from');
  const requestedEndUtc = parseCustomRangeDate(to, 'to');
  const rangeEndUtc = requestedEndUtc > latestEndUtc ? latestEndUtc : requestedEndUtc;

  if (rangeStartUtc >= rangeEndUtc) {
    throw new Error(
      'Unsupported analytics custom range: from must be before to, and not in the future'
    );
  }
  if (requestedEndUtc.getTime() - rangeStartUtc.getTime() > MAX_RANGE_MS) {
    throw new Error(
      `Unsupported analytics custom range: longer than ${MAX_CUSTOM_RANGE_DAYS} days`
    );
  }
  return { rangeStartUtc, rangeEndUtc, requestedEndUtc };
}

function resolvePresetRange(rangePreset, latestEndUtc, timeZone) {
  const rangeEndUtc = latestEndUtc;
  let rangeStartUtc;

  if (rangePreset === RANGE_PRESETS.TODAY) {
    rangeStartUtc = getBucketStartUtc(rangeEndUtc, 24 * 60, timeZone);
  } else if (rangePreset === RANGE_PRESETS.LAST_24H) {
    rangeStartUtc = new Date(rangeEndUtc.getTime() - 24 * 60 * 60 * 1000);
  } else if (rangePreset === RANGE_PRESETS.LAST_7D) {
    rangeStartUtc = new Date(rangeEndUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return { rangeStartUtc, rangeEndUtc };
}

function resolveAnalyticsTimeWindow(options = {}) {
  const rangePreset = options.range || DEFAULT_RANGE_PRESET;
  const now = options.now || new Date();
  const refreshSnapMinutes = options.refreshSnapMinutes || DEFAULT_REFRESH_SNAP_MINUTES;

  if (!isSupportedRangePreset(rangePreset)) {
    throw new Error(`Unsupported analytics range preset: ${rangePreset}`);
  }

  const timeZone = normalizeTimeZone(options.timeZone);
  const latestEndUtc = floorDateToMinutes(now, refreshSnapMinutes);
  const { rangeStartUtc, rangeEndUtc, requestedEndUtc } =
    rangePreset === RANGE_PRESETS.CUSTOM
      ? resolveCustomRange(options.from, options.to, latestEndUtc)
      : resolvePresetRange(rangePreset, latestEndUtc, timeZone);

  // Callers that only need the range bounds (report metrics) may omit the bucket.
  const validBuckets = getValidBucketPresets(
    rangePreset,
    rangeStartUtc,
    requestedEndUtc || rangeEndUtc
  );
  const bucketPreset = options.bucket ||
    (validBuckets.includes(DEFAULT_BUCKET_PRESET) ? DEFAULT_BUCKET_PRESET : validBuckets[0]);

  if (!validBuckets.includes(bucketPreset)) {
    throw new Error(
      `Unsupported analytics bucket preset "${bucketPreset}" for range "${rangePreset}"`
    );
  }

  const bucketSizeMinutes = getBucketSizeMinutes(bucketPreset);
  const aggregationMethod = normalizeAggregationMethod(options.aggregationMethod);
  const startTimeToleranceMinutes = normalizeStartTimeToleranceMinutes(
    options.startTimeToleranceMinutes
  );

  return {
    rangePreset,
    bucketPreset,
    bucketSizeMinutes,
    aggregationMethod,
    startTimeToleranceMinutes,
    timeZone,
    rangeStartUtc,
    rangeEndUtc,
    refreshSnapMinutes,
  };
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
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
  MAX_CUSTOM_RANGE_DAYS,
  MAX_RANGE_MS,
  DEFAULT_TIME_ZONE,
  TIME_ZONE_GRANULARITY_MS,
  isStartTimeAggregation,
  normalizeAggregationMethod,
  normalizeStartTimeToleranceMinutes,
  normalizeTimeZone,
  BUCKET_SIZE_MINUTES,
  VALID_BUCKETS_BY_RANGE,
  DEFAULT_RANGE_PRESET,
  DEFAULT_BUCKET_PRESET,
  DEFAULT_REFRESH_SNAP_MINUTES,
  floorDateToMinutes,
  floorToBucketStartMs,
  getUtcStartOfDay,
  getBucketStartUtc,
  getBucketEndUtc,
  getBucketSizeMinutes,
  getValidBucketPresets,
  isSupportedRangeBucket,
  resolveAnalyticsTimeWindow,
};
