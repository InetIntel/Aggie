import { Report } from "../../api/reports/types";
import { useReportChartImage } from "./useReportChartImage";
import ExpandableChart from "./ExpandableChart";
import { useFormatters } from "../../utils/useFormatters";

interface IProps {
  report: Report;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
}

// cloudflare traffic anomaly
const TrafficEvent = ({ report, compact }: IProps) => {
  const { formatDateTime } = useFormatters();
  const rawData = report?.metadata?.rawAPIResponse;
  const endDate = rawData?.rawEvent?.endDate || "now";
  // Chart is a media-storage key (served at /media/...) or a legacy absolute URL;
  // fetched lazily when the list query stripped it.
  const image = useReportChartImage(report);
  return (
    <>
      <h2 className='font-medium'>{report?.author}</h2>
      <p className='mb-1'>
        {formatDateTime(report?.authoredAt)} -{" "}
        {endDate === "now" ? "now" : formatDateTime(endDate)}
      </p>
      <ExpandableChart
        key={image}
        image={image}
        alt='traffic trend'
        compact={compact}
      />
    </>
  );
};

export default TrafficEvent;
