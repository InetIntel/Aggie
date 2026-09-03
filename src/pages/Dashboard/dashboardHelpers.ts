import type {
  AnalyticsOverview,
  NotableActivity,
} from "../../api/analytics/types";
import type { IncidentFormValues } from "../incidents/CreateEditIncidentForm";

export function getAnalyticsRoom(cacheKey: string) {
  return `analytics:${cacheKey}`;
}

export function getActivityLocationSummary(activity: NotableActivity) {
  return [activity.asn, activity.geoScope].filter(Boolean).join(" / ");
}

export function buildIncidentTitle(activity: NotableActivity) {
  const locationSummary = getActivityLocationSummary(activity);
  const prefix = locationSummary
    ? `[Notable Activity] ${locationSummary}`
    : "[Notable Activity]";
  return `${prefix}: ${formatActivityWindow(activity.bucketStart, activity.bucketEnd)}`;
}

export function buildIncidentInitialValues(
  activity: NotableActivity
): IncidentFormValues {
  return {
    title: buildIncidentTitle(activity),
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

export function formatXAxisLabel(value: string) {
  const date = new Date(value);
  return [
    `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
    date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).toLowerCase(),
  ];
}

export function formatActivityWindow(start: string, end: string) {
  const [startDate, startTime] = formatXAxisLabel(start);
  const [endDate, endTime] = formatXAxisLabel(end);

  return startDate === endDate
    ? `${startDate}, ${startTime} - ${endTime} UTC`
    : `${startDate} ${startTime} - ${endDate} ${endTime} UTC`;
}

export function formatCompactDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRangeLabel(overview: AnalyticsOverview) {
  return `${formatCompactDateTime(overview.rangeStartUtc)} to ${formatCompactDateTime(
    overview.rangeEndUtc
  )}`;
}
