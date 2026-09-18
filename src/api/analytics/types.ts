export const ANALYTICS_RANGE_PRESETS = ["today", "last24h", "last7d"] as const;
export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];

export const ANALYTICS_BUCKET_PRESETS = ["30m", "1h", "6h", "24h"] as const;
export type AnalyticsBucketPreset = (typeof ANALYTICS_BUCKET_PRESETS)[number];

// How reports are grouped into one notable activity. "bucket" floors each report's
// outage start onto a fixed grid of `bucket` size; "startTime" ignores the grid and
// clusters reports whose outages started within `tolerance` minutes of each other.
// Both are selectable so the two can be compared side by side.
export const ANALYTICS_AGGREGATION_METHODS = ["bucket", "startTime"] as const;
export type AnalyticsAggregationMethod =
  (typeof ANALYTICS_AGGREGATION_METHODS)[number];

// Gap options offered for the startTime method. 0 groups only identical timestamps.
export const START_TIME_TOLERANCE_OPTIONS = [0, 1, 5, 15, 30, 60] as const;
export const DEFAULT_START_TIME_TOLERANCE_MINUTES = 5;

export interface AnalyticsQueryState {
  range?: AnalyticsRangePreset;
  bucket?: AnalyticsBucketPreset;
  aggregation?: AnalyticsAggregationMethod;
  tolerance?: number;
  limit?: number;
}

export interface AnalyticsIncidentBasePayload {
  cacheKey: string;
  eventAggKey: string;
}

export interface CreateNotableActivityIncidentPayload
  extends AnalyticsIncidentBasePayload {
  group: {
    title: string;
    notes?: string;
    locationName?: string;
    closed?: boolean;
    verification_status?: string | boolean | null;
    confirmation_status?: string | boolean | null;
    publication_status?: string[];
    assignedTo?: string[];
    public?: boolean;
    escalated?: boolean;
  };
}

export interface UpdateNotableActivityIncidentPayload
  extends AnalyticsIncidentBasePayload {
  mode: "add" | "remove";
  groupId?: string;
}

export interface AnalyticsSocketQuery {
  cacheKey: string;
  rangePreset: AnalyticsRangePreset;
  bucketPreset: AnalyticsBucketPreset;
  bucketSizeMinutes: number;
  // Sent so the server's background refresh recomputes this subscription with the same
  // grouping; without it a refresh would overwrite the cache with fixed-grid activities.
  aggregationMethod: AnalyticsAggregationMethod;
  startTimeToleranceMinutes?: number;
  rangeStartUtc: string;
  rangeEndUtc: string;
}

export interface AnalyticsUpdateEvent {
  cacheKey: string;
  rangePreset: AnalyticsRangePreset;
  bucketPreset: AnalyticsBucketPreset;
  aggregationMethod?: AnalyticsAggregationMethod;
  computedAt: string;
}

export interface AnalyticsTimeSeriesBucket {
  bucketStart: string;
  bucketEnd: string;
  totalReports: number;
  // { <media>: count }, summing to totalReports — the chart's per-source lines.
  reportsBySource?: Record<string, number>;
  notableActivityCount: number;
  highConfidenceActivityCount: number;
}

export interface AnalyticsOverviewMetrics {
  notableActivityCount: number;
  highConfidenceActivityCount: number;
  totalReports: number;
}

export interface AnalyticsOverview {
  cacheKey: string;
  cacheStatus: "hit" | "miss";
  computedAt: string;
  expiresAt: string;
  rangePreset: AnalyticsRangePreset;
  bucketPreset: AnalyticsBucketPreset;
  bucketSizeMinutes: number;
  aggregationMethod: AnalyticsAggregationMethod;
  startTimeToleranceMinutes?: number;
  rangeStartUtc: string;
  rangeEndUtc: string;
  metrics: AnalyticsOverviewMetrics;
  timeSeries: AnalyticsTimeSeriesBucket[];
}

export interface ReportMetric {
  key: string;
  label: string;
  count: number;
  // Deep-link URL params for the destination reports list; serialized verbatim.
  query: Record<string, string>;
}

export interface ReportMetricCategory {
  key: "alerts" | "social";
  label: string;
  metrics: ReportMetric[];
}

export interface ReportMetricsResponse {
  rangePreset: AnalyticsRangePreset;
  rangeStartUtc: string;
  rangeEndUtc: string;
  categories: ReportMetricCategory[];
}

export interface NotableActivity {
  eventAggKey: string;
  eventAggKeyBase: string;
  bucketStart: string;
  bucketEnd: string;
  bucketSizeMinutes: number;
  sourceCnt: number;
  sources: string[];
  signalCnt: number;
  signals: string[];
  totalReports: number;
  reportIds: string[];
  // Per-bucket report counts by each report's own outageStartedAt, so the chart
  // counts a merged OONI report where the alerts list's filter finds it.
  reportBuckets?: {
    bucketStart: string;
    totalReports: number;
    sourceCounts?: Record<string, number>;
  }[];
  isHighConfidence: boolean;
  // Which grouping produced this activity. Under "startTime", bucketStart/bucketEnd are
  // the first and last outage start in the cluster rather than a grid cell's edges.
  aggregationMethod?: AnalyticsAggregationMethod;
  // "*" for a startTime activity: it groups on outage start alone, so it is not tied to
  // one asn|geoScope. The keys it actually covers are in eventAggKeyBases.
  eventAggKeyBases?: string[];
  // Set only when the activity covers exactly one; prefer asns/locations, which are
  // populated either way and are the normal case under startTime grouping.
  asn?: string;
  geoScope?: string;
  asns?: string[];
  // Distinct "asn / region" labels, paired per report.
  locations?: string[];
  incidentId: string | null;
}

export interface NotableActivitiesResponse {
  cacheKey: string;
  cacheStatus: "hit" | "miss";
  computedAt: string;
  expiresAt: string;
  rangePreset: AnalyticsRangePreset;
  bucketPreset: AnalyticsBucketPreset;
  bucketSizeMinutes: number;
  aggregationMethod: AnalyticsAggregationMethod;
  startTimeToleranceMinutes?: number;
  rangeStartUtc: string;
  rangeEndUtc: string;
  notableActivities: NotableActivity[];
  highConfidenceActivities: NotableActivity[];
}
