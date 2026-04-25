export const ANALYTICS_RANGE_PRESETS = ["today", "last24h", "last7d"] as const;
export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];

export const ANALYTICS_BUCKET_PRESETS = ["30m", "1h", "6h", "24h"] as const;
export type AnalyticsBucketPreset = (typeof ANALYTICS_BUCKET_PRESETS)[number];

export interface AnalyticsQueryState {
  range?: AnalyticsRangePreset;
  bucket?: AnalyticsBucketPreset;
  limit?: number;
}

export interface AnalyticsTimeSeriesBucket {
  bucketStart: string;
  bucketEnd: string;
  totalReports: number;
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
  rangeStartUtc: string;
  rangeEndUtc: string;
  metrics: AnalyticsOverviewMetrics;
  timeSeries: AnalyticsTimeSeriesBucket[];
}

export interface NotableActivity {
  eventAggKey: string;
  eventAggKeyBase: string;
  bucketStart: string;
  bucketEnd: string;
  bucketSizeMinutes: number;
  sourceCnt: number;
  signalCnt: number;
  totalReports: number;
  reportIds: string[];
  isHighConfidence: boolean;
  asn?: string;
  geoScope?: string;
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
  rangeStartUtc: string;
  rangeEndUtc: string;
  notableActivities: NotableActivity[];
  highConfidenceActivities: NotableActivity[];
}
