import { useQuery } from "@tanstack/react-query";

import { getReport } from "../../api/reports";
import type { Report } from "../../api/reports/types";

// The reports LIST endpoint strips metadata.rawAPIResponse.image (the IODA/Cloudflare
// chart, now a media-storage key) to keep list payloads small, so reports coming from
// a list query lack it. When that's the case, lazily fetch the full report by id
// (GET /api/report/:id — no read-on-view side effect) and pull the image from there.
// Returns the raw image value (storage key | absolute URL | legacy inline SVG), or
// undefined while a needed fetch is in flight.
export function useReportChartImage(report: Report): string | undefined {
  const present: string | undefined = report?.metadata?.rawAPIResponse?.image;
  const { data } = useQuery(
    ["report", report?._id, "chart-image"],
    () => getReport(report?._id),
    { staleTime: 5 * 60 * 1000, enabled: !!report?._id && !present }
  );
  return present ?? data?.metadata?.rawAPIResponse?.image;
}
