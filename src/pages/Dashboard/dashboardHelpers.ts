import { useMemo } from "react";
import type {
  AnalyticsOverview,
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
