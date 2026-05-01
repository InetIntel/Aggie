export const ANALYTICS_RANGE_PRESETS = ["today", "last24h", "last7d"] as const;
export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];

export const ANALYTICS_BUCKET_PRESETS = ["30m", "1h", "6h", "24h"] as const;
export type AnalyticsBucketPreset = (typeof ANALYTICS_BUCKET_PRESETS)[number];

export interface AnalyticsQueryState {
  range?: AnalyticsRangePreset;
  bucket?: AnalyticsBucketPreset;
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
  rangeStartUtc: string;
  rangeEndUtc: string;
}

export interface AnalyticsUpdateEvent {
  cacheKey: string;
  rangePreset: AnalyticsRangePreset;
  bucketPreset: AnalyticsBucketPreset;
  computedAt: string;
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
