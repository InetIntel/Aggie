import { useQuery } from "@tanstack/react-query";

import { getReport } from "../../api/reports";
import type { IodaChartData, Report } from "../../api/reports/types";

// IODA reports now carry their chart as signal series at metadata.rawAPIResponse.chart.
// The reports LIST endpoint strips this field to keep list payloads small, so reports
// from a list query lack it; when that's the case, lazily fetch the full report by id
// (GET /api/report/:id — no read-on-view side effect) and pull the series from there.
// Mirrors useReportChartImage, which still serves Cloudflare + legacy IODA image charts.
// Returns the chart series, or undefined while a needed fetch is in flight / none exists.
export function useReportChartSeries(report: Report): IodaChartData | undefined {
  const present: IodaChartData | undefined = report?.metadata?.rawAPIResponse?.chart;
  const { data } = useQuery(
    ["report", report?._id, "chart-series"],
    () => getReport(report?._id),
    { staleTime: 5 * 60 * 1000, enabled: !!report?._id && !present }
  );
  return present ?? data?.metadata?.rawAPIResponse?.chart;
}
