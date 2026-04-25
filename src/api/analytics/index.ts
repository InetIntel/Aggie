import axios from "axios";
import type {
  AnalyticsOverview,
  AnalyticsQueryState,
  NotableActivitiesResponse,
} from "./types";

function buildAnalyticsQuery(params: AnalyticsQueryState = {}) {
  const searchParams = new URLSearchParams();

  if (params.range) searchParams.set("range", params.range);
  if (params.bucket) searchParams.set("bucket", params.bucket);
  if (typeof params.limit === "number") {
    searchParams.set("limit", params.limit.toString());
  }

  return searchParams.toString();
}

export const getAnalyticsOverview = async (
  params: AnalyticsQueryState = {}
) => {
  const query = buildAnalyticsQuery(params);
  const url = query ? `/api/analytics/overview?${query}` : "/api/analytics/overview";
  const { data } = await axios.get<AnalyticsOverview>(url);
  return data;
};

export const getNotableActivities = async (
  params: AnalyticsQueryState = {}
) => {
  const query = buildAnalyticsQuery(params);
  const url = query
    ? `/api/analytics/notable-activities?${query}`
    : "/api/analytics/notable-activities";
  const { data } = await axios.get<NotableActivitiesResponse>(url);
  return data;
};
