import { Report } from "../../api/reports/types";
import {
  signalToNameColor,
  SIGNAL_BADGE_BASE,
} from "../SocialMediaPost/reportParser";
import { useReportChartImage } from "./useReportChartImage";
import ExpandableChart from "./ExpandableChart";
import AggieToken from "../AggieToken";
import { useFormatters } from "../../utils/useFormatters";

interface IProps {
  report: Report;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
}

const IodaEvent = ({ report, compact }: IProps) => {
  const { formatDateTime } = useFormatters();
  const rawData = report?.metadata?.rawAPIResponse;
  const start = formatDateTime(report?.authoredAt, "");
  const end = formatDateTime(rawData?.ended, "");

  const rawSignal = rawData?.rawEvent?.datasource;
  let [signal, bgColor] = signalToNameColor(rawSignal);

  // Chart now lives in media storage; the report carries a key resolved to /media/...
  // (older reports may still carry an inline SVG string). Fetched lazily when the
  // list query stripped it. ExpandableChart handles inline-SVG vs <img>, the compact
  // height cap, and click-to-enlarge.
  const image = useReportChartImage(report);

  return (
    <>
      {signal && (
        <div className='flex gap-2 items-center'>
          <AggieToken
            className={`${bgColor} ${SIGNAL_BADGE_BASE} ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {signal}
          </AggieToken>
        </div>
      )}
      <p className='mb-1'>
        {start}{end && ` - ${end}`}
      </p>
      <ExpandableChart image={image} alt='IODA event chart' compact={compact} />
    </>
  );
};

export default IodaEvent;
