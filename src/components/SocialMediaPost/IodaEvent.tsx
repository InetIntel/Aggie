import { Report } from "../../api/reports/types";
import {
  signalToNameColor,
  SIGNAL_BADGE_BASE,
} from "../SocialMediaPost/reportParser";
import { useReportChartImage } from "./useReportChartImage";
import { useReportChartSeries } from "./useReportChartSeries";
import IodaChart from "./IodaChart";
import ExpandableChart from "./ExpandableChart";
import ChartExpander from "./ChartExpander";
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
  // An ongoing outage has no end time yet — IODA only reports elapsed time so far.
  const isOngoing = rawData?.isOngoing === true;
  const start = formatDateTime(report?.authoredAt, "");
  const end = isOngoing ? "Present" : formatDateTime(rawData?.ended, "");

  const rawSignal = rawData?.rawEvent?.datasource;
  let [signal, bgColor] = signalToNameColor(rawSignal);

  // New IODA reports carry signal series (rendered client-side with recharts); older
  // reports carry a scraped chart image (media key resolved to /media/..., or a legacy
  // inline SVG string). Both are lazily fetched when the list query stripped them.
  const chart = useReportChartSeries(report);
  const image = useReportChartImage(report);

  // Shade the outage window on the recharts chart.
  const outageStart: number | undefined = rawData?.rawEvent?.start;
  const outageEnd: number | undefined =
    isOngoing || outageStart === undefined || rawData?.rawEvent?.duration === undefined
      ? undefined
      : outageStart + rawData.rawEvent.duration;

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
      {chart?.series?.length ? (
        // Interactive recharts chart. surfaceClick off so the corner button (not a
        // click on the chart body) toggles enlarge — the body drives the zoom Brush.
        <ChartExpander compact={compact} surfaceClick={false}>
          {(enlarged) => (
            <IodaChart
              chart={chart}
              compact={compact && !enlarged}
              outageStart={outageStart}
              outageEnd={outageEnd}
            />
          )}
        </ChartExpander>
      ) : (
        <ExpandableChart
          key={image}
          image={image}
          alt='IODA event chart'
          compact={compact}
        />
      )}
    </>
  );
};

export default IodaEvent;
