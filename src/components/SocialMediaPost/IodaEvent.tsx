import { Report } from "../../api/reports/types";
import {
  signalToNameColor,
  resolveMediaUrl,
  isInlineSvg,
} from "../SocialMediaPost/reportParser";
import { useReportChartImage } from "./useReportChartImage";
import AggieToken from "../AggieToken";

interface IProps {
  report: Report;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
}

const IodaEvent = ({ report, compact }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const start = report?.authoredAt?.replace('T', ' ').substring(0, 16);
  const end = rawData?.ended?.replace('T', ' ').substring(0, 16);

  const rawSignal = rawData?.rawEvent?.datasource;
  let [signal, bgColor] = signalToNameColor(rawSignal);

  // Chart now lives in media storage; the report carries a key resolved to /media/...
  // (older reports may still carry an inline SVG string). Fetched lazily when the
  // list query stripped it.
  const image = useReportChartImage(report);
  const svg = isInlineSvg(image)
    ? image!
        .replace('width="726"', 'width="100%"')
        .replace('width="733"', 'width="100%"')
        .replace('height="514"', 'height="auto"')
    : "";

  return (
    <>
      <div className='flex gap-2 items-center'>
        <h2 className='font-medium'>{report?.author}</h2>
        <AggieToken
          className={`${bgColor} rounded-lg text-white dark:text-gray-300 ${
            compact ? "p-0.5 text-xs" : "p-1 text-sm"
          }`}
        >
          {signal}
        </AggieToken>
      </div>
      <p className='mb-1'>
        {start} - {end} UTC
      </p>
      {!image ? null : svg ? (
        <div
          className={
            compact
              ? "overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-52"
              : undefined
          }
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <img
          src={resolveMediaUrl(image)}
          alt='IODA event chart'
          className={
            compact ? "w-full max-h-52 object-contain object-left-top" : "w-full"
          }
        />
      )}
    </>
  );
};

export default IodaEvent;
