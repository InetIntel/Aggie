import { Report } from "../../api/reports/types";
import {
  signalToNameColor,
  resolveMediaUrl,
  isInlineSvg,
  SIGNAL_BADGE_BASE,
} from "../SocialMediaPost/reportParser";
import { useReportChartImage } from "./useReportChartImage";
import { useReportChartSeries } from "./useReportChartSeries";
import IodaChart from "./IodaChart";
import AggieToken from "../AggieToken";

interface IProps {
  report: Report;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
}

const IodaEvent = ({ report, compact }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const start = report?.authoredAt?.replace('T', ' ').substring(0, 16);
  // An ongoing outage has no end time yet — IODA only reports elapsed time so far.
  const isOngoing = rawData?.isOngoing === true;
  const end = isOngoing
    ? "Present"
    : rawData?.ended?.replace('T', ' ').substring(0, 16);

  const rawSignal = rawData?.rawEvent?.datasource;
  let [signal, bgColor] = signalToNameColor(rawSignal);

  // New IODA reports carry signal series (rendered client-side with recharts); older
  // reports carry a scraped chart image (media key resolved to /media/..., or a legacy
  // inline SVG string). Both are lazily fetched when the list query stripped them.
  const chart = useReportChartSeries(report);
  const image = useReportChartImage(report);
  const svg = isInlineSvg(image) ? image! : "";

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
        {isOngoing ? `${start} UTC - Present` : `${start} - ${end} UTC`}
      </p>
      {chart?.series?.length ? (
        <IodaChart
          chart={chart}
          compact={compact}
          outageStart={outageStart}
          outageEnd={outageEnd}
        />
      ) : !image ? null : svg ? (
        <div
          className={
            compact
              ? "overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-52"
              : "[&_svg]:w-full [&_svg]:h-auto"
          }
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <img
          src={resolveMediaUrl(image)}
          alt='IODA event chart'
          className={
            compact
              ? "w-full max-h-52 object-contain object-center"
              : "w-full"
          }
        />
      )}
    </>
  );
};

export default IodaEvent;
