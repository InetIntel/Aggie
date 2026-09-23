import { useQuery } from "@tanstack/react-query";

import { getReport } from "../../api/reports";
import type { OoniChartData, Report } from "../../api/reports/types";

// OONI alerts carry their 14-day series at metadata.rawAPIResponse.chart. The
// reports LIST endpoint strips that field to keep list payloads small, so when
// it is missing, fetch the full report by id (GET /api/report/:id) and read it
// from there. Same approach as useReportChartSeries for IODA. Nothing here
// calls OONI.
export function useOoniChart(report: Report): {
  chart: OoniChartData | undefined;
  loading: boolean;
} {
  // rawAPIResponse.chart is typed for IODA; the OONI shape is stored under the same key.
  const asOoni = (r?: Report) =>
    r?.metadata?.rawAPIResponse?.chart as unknown as OoniChartData | undefined;
  const present = asOoni(report);
  const { data, isLoading } = useQuery(
    ["report", report?._id, "ooni-chart"],
    () => getReport(report?._id),
    { staleTime: 5 * 60 * 1000, enabled: !!report?._id && !present }
  );
  return {
    chart: present ?? asOoni(data),
    loading: !present && isLoading,
  };
}
