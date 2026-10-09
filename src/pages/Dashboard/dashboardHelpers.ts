import { useMemo, useState } from "react";
import type {
  AnalyticsBucketPreset,
  AnalyticsOverview,
  AnalyticsQueryState,
  AnalyticsRangePreset,
  AnalyticsSocketQuery,
  NotableActivitiesResponse,
  NotableActivity,
} from "../../api/analytics/types";
import {
  DEFAULT_PREFS,
  EMPTY_DATE,
  dateLocale,
  formatTime,
  formatTimeZone,
  resolveTimeZone,
  toDate,
} from "../../utils/dateFormat";
import type { DateInput, UserPreferences } from "../../utils/dateFormat";
import { useFormatters } from "../../utils/useFormatters";
import type { IncidentFormValues } from "../incidents/CreateEditIncidentForm";

export function getAnalyticsRoom(cacheKey: string) {
  return `analytics:${cacheKey}`;
}

// The live-refresh subscription for one analytics response, echoing back the exact
// window and grouping it was computed with.
export function buildAnalyticsSocketQuery(
  data: AnalyticsOverview | NotableActivitiesResponse
): AnalyticsSocketQuery {
  return {
    cacheKey: data.cacheKey,
    rangePreset: data.rangePreset,
    bucketPreset: data.bucketPreset,
    bucketSizeMinutes: data.bucketSizeMinutes,
    aggregationMethod: data.aggregationMethod,
    startTimeToleranceMinutes: data.startTimeToleranceMinutes,
    timeZone: data.timeZone,
    rangeStartUtc: data.rangeStartUtc,
    rangeEndUtc: data.rangeEndUtc,
  };
}

/**
 * The IANA zone the backend lays the bucket grid out in: UTC, or the browser's own zone
 * under the "local" preference — the same zone every dashboard timestamp is shown in.
 */
export function getAnalyticsTimeZone(prefs: UserPreferences = DEFAULT_PREFS) {
  return (
    resolveTimeZone(prefs) ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC"
  );
}

/**
 * Custom-range days are held as the browser-local noon of the picked calendar day. Noon
 * rather than midnight so the day reads the same whether it is displayed in local time
 * or UTC (the DateSelector formats it under the user's preference).
 */
export function toPickerDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString();
}

export function addPickerDays(pickerDay: string, days: number) {
  const date = new Date(pickerDay);
  return toPickerDay(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
  );
}

// Midnight at the start of a picked day, in the zone the user views times in.
function startOfPickerDay(pickerDay: string, prefs: UserPreferences) {
  const date = new Date(pickerDay);
  const [year, month, day] = [date.getFullYear(), date.getMonth(), date.getDate()];
  return prefs.timeZone === "utc"
    ? new Date(Date.UTC(year, month, day))
    : new Date(year, month, day);
}

// A custom range covers both picked days whole: from the first one's midnight up to the
// midnight after the last. The backend cuts it at "now".
export function getCustomRangeBounds(
  fromDay: string,
  toDay: string,
  prefs: UserPreferences = DEFAULT_PREFS
) {
  return {
    from: startOfPickerDay(fromDay, prefs).toISOString(),
    to: startOfPickerDay(addPickerDays(toDay, 1), prefs).toISOString(),
  };
}

// Mirrors CUSTOM_BUCKETS_BY_MAX_SPAN_DAYS in backend/api/utils/analyticsTime.js, applied
// to the range as requested.
export function getCustomRangeBuckets(from: string, to: string): AnalyticsBucketPreset[] {
  const spanDays = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
  if (spanDays <= 2) return ["30m", "1h", "6h"];
  if (spanDays <= 7) return ["1h", "6h", "24h"];
  return ["6h", "24h"];
}

// Hourly whenever the range offers it (up to a week), otherwise the finest bucket offered.
// Mirrors the default in resolveAnalyticsTimeWindow.
export function getDefaultBucket(options: AnalyticsBucketPreset[]): AnalyticsBucketPreset {
  return options.includes("1h") ? "1h" : options[0];
}

// Bucket sizes offered per preset; a custom range's depend on its length.
// Mirrors VALID_BUCKETS_BY_RANGE in backend/api/utils/analyticsTime.js.
const presetBuckets: Record<
  Exclude<AnalyticsRangePreset, "custom">,
  AnalyticsBucketPreset[]
> = {
  today: ["30m", "1h", "6h"],
  last24h: ["1h", "6h"],
  last7d: ["1h", "6h", "24h"],
};

// A custom range starts out as the last seven days, including today.
const DEFAULT_CUSTOM_RANGE_DAYS = 7;

/**
 * One card's time window: its range preset, its custom days, and the query params and
 * default bucket they resolve to. Each dashboard card holds its own, so changing one
 * card's range leaves the others alone. Times are laid out in the zone the user reads
 * them in, so a 24h bucket runs midnight to midnight for them.
 */
export function useAnalyticsWindow(prefs: UserPreferences) {
  const [range, setRange] = useState<AnalyticsRangePreset>("last24h");
  const [customToDay, setCustomToDay] = useState(() => toPickerDay(new Date()));
  const [customFromDay, setCustomFromDay] = useState(() =>
    addPickerDays(toPickerDay(new Date()), -(DEFAULT_CUSTOM_RANGE_DAYS - 1))
  );

  const timeZone = getAnalyticsTimeZone(prefs);
  const customBounds = useMemo(
    () => getCustomRangeBounds(customFromDay, customToDay, prefs),
    [customFromDay, customToDay, prefs]
  );
  const params: AnalyticsQueryState = useMemo(
    () =>
      range === "custom"
        ? { range, ...customBounds, timeZone }
        : { range, timeZone },
    [range, customBounds, timeZone]
  );
  // Charts have no interval toggle; each range uses its default bucket.
  const bucket = getDefaultBucket(
    range === "custom"
      ? getCustomRangeBuckets(customBounds.from, customBounds.to)
      : presetBuckets[range]
  );

  return {
    range,
    setRange,
    customFromDay,
    customToDay,
    setCustomRange: (fromDay: string, toDay: string) => {
      setCustomFromDay(fromDay);
      setCustomToDay(toDay);
    },
    params,
    bucket,
  };
}

export type AnalyticsWindow = ReturnType<typeof useAnalyticsWindow>;

export function getActivityLocationSummary(activity: NotableActivity) {
  const locations = activity.locations || [];

  if (locations.length > 1) {
    return `${locations[0]} +${locations.length - 1} more`;
  }
  if (locations.length === 1) return locations[0];

  return [activity.asn, activity.geoScope].filter(Boolean).join(" / ");
}

export function buildIncidentTitle(
  activity: NotableActivity,
  prefs: UserPreferences = DEFAULT_PREFS
) {
  const locationSummary = getActivityLocationSummary(activity);
  const prefix = locationSummary
    ? `[Notable Activity] ${locationSummary}`
    : "[Notable Activity]";
  return `${prefix}: ${formatActivityWindow(
    activity.bucketStart,
    activity.bucketEnd,
    prefs
  )}`;
}

export function buildIncidentInitialValues(
  activity: NotableActivity,
  prefs: UserPreferences = DEFAULT_PREFS
): IncidentFormValues {
  return {
    title: buildIncidentTitle(activity, prefs),
    notes:"",
    // notes: [
    //   "Created from dashboard notable activity.",
    //   `Reports: ${activity.totalReports}`,
    //   `Sources: ${activity.sourceCnt}`,
    //   `Signals: ${activity.signalCnt}`,
    // ].join("\n"),
    locationName: getActivityLocationSummary(activity),
    closed: false,
    verification_status: "maybe",
    confirmation_status: "maybe",
    publication_status: ["Not Published"],
    assignedTo: [],
    public: false,
    escalated: activity.isHighConfidence,
  };
}

/**
 * The dashboard's timestamps sit in chart axes and card
 * headers where the shared `formatDate` (which always carries a four-digit year)
 * is too wide, so the compact parts are built here from the same prefs.
 */
export function formatCompactDate(
  value: DateInput,
  prefs: UserPreferences = DEFAULT_PREFS,
  empty: string = EMPTY_DATE
) {
  const date = toDate(value);
  if (!date) return empty;
  return new Intl.DateTimeFormat(dateLocale(prefs), {
    month: "numeric",
    day: "numeric",
    timeZone: resolveTimeZone(prefs),
  }).format(date);
}

// Two lines — date above time — for the trend chart's x-axis ticks.
export function formatXAxisLabel(
  value: DateInput,
  prefs: UserPreferences = DEFAULT_PREFS
) {
  return [formatCompactDate(value, prefs), formatTime(value, prefs)];
}

export function formatActivityWindow(
  start: string,
  end: string,
  prefs: UserPreferences = DEFAULT_PREFS
) {
  const [startDate, startTime] = formatXAxisLabel(start, prefs);
  const [endDate, endTime] = formatXAxisLabel(end, prefs);
  // "UTC" under the UTC preference, otherwise the viewer's own abbreviation
  // ("EDT", "IRST"), so a local-time window is never mistaken for UTC.
  const zone = formatTimeZone(end, prefs);
  const suffix = zone ? ` ${zone}` : "";

  // Start-time grouping can produce a single-report activity, whose window is one
  // instant.
  if (start === end) return `${startDate}, ${startTime}${suffix}`;

  return startDate === endDate
    ? `${startDate}, ${startTime} - ${endTime}${suffix}`
    : `${startDate} ${startTime} - ${endDate} ${endTime}${suffix}`;
}

export function formatCompactDateTime(
  value: DateInput,
  prefs: UserPreferences = DEFAULT_PREFS
) {
  const date = toDate(value);
  if (!date) return EMPTY_DATE;
  return `${formatCompactDate(date, prefs)}, ${formatTime(date, prefs)}`;
}

export function formatRangeLabel(
  overview: AnalyticsOverview,
  prefs: UserPreferences = DEFAULT_PREFS
) {
  return `${formatCompactDateTime(
    overview.rangeStartUtc,
    prefs
  )} to ${formatCompactDateTime(overview.rangeEndUtc, prefs)}`;
}

export function useDashboardFormatters() {
  const { prefs } = useFormatters();

  return useMemo(
    () => ({
      prefs,
      formatCompactDate: (value: DateInput) => formatCompactDate(value, prefs),
      formatCompactDateTime: (value: DateInput) =>
        formatCompactDateTime(value, prefs),
      formatXAxisLabel: (value: DateInput) => formatXAxisLabel(value, prefs),
      formatActivityWindow: (start: string, end: string) =>
        formatActivityWindow(start, end, prefs),
      formatRangeLabel: (overview: AnalyticsOverview) =>
        formatRangeLabel(overview, prefs),
      buildIncidentTitle: (activity: NotableActivity) =>
        buildIncidentTitle(activity, prefs),
      buildIncidentInitialValues: (activity: NotableActivity) =>
        buildIncidentInitialValues(activity, prefs),
    }),
    [prefs.timeFormat, prefs.dateFormat, prefs.timeZone] // eslint-disable-line react-hooks/exhaustive-deps
  );
}
