import { Report } from "../../api/reports/types";
import {
  signalToNameColor,
  resolveMediaUrl,
  isInlineSvg,
  SIGNAL_BADGE_BASE,
} from "../SocialMediaPost/reportParser";
import { useReportChartImage } from "./useReportChartImage";
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
  // list query stripped it. The SVG carries its own viewBox, so sizing/centering is
  // handled purely in CSS below — no width/height string rewriting needed.
  const image = useReportChartImage(report);
  const svg = isInlineSvg(image) ? image! : "";

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
      {!image ? null : svg ? (
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
