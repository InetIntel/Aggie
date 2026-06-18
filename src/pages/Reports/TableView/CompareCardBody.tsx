import { faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { Report } from "../../../api/reports/types";
import DateTime from "../../../components/DateTime";
import SocialMediaIcon from "../../../components/SocialMediaPost/SocialMediaIcon";
import {
  signalToNameColor,
  resolveMediaUrl,
  isInlineSvg,
} from "../../../components/SocialMediaPost/reportParser";
import { useReportChartImage } from "../../../components/SocialMediaPost/useReportChartImage";
import { formatStamp, formatDuration } from "./compareCardFormat";

interface IProps {
  report: Report;
}

// Bespoke presentational card for the alerts compare modal. Unlike SocialMediaPost
// it lays content out in IDENTICAL fixed-height bands (header / title / times /
// signal / footer) with the chart as the flex remainder, so the dividers between
// bands sit at the same vertical offset across every card in the equal-height grid.
// Purely presentational — no read-on-view side effect.
const CompareCardBody = ({ report }: IProps) => {
  const media = report._media?.[0];
  const raw = report?.metadata?.rawAPIResponse;
  const platformLabel = media === "cloudflare" ? "Cloudflare" : "IODA";

  // The reports LIST endpoint strips metadata.rawAPIResponse.image (the chart, now a
  // media-storage key) to keep payloads small, so it's absent on the report objects
  // fed into the compare modal. The hook lazily fetches the full report per card.
  const image = useReportChartImage(report);

  const start = formatStamp(report?.authoredAt);

  let end: string;
  let duration: string;
  let signal: string;
  let bgColor: string;

  if (media === "cloudflare") {
    const endRaw: string | undefined = raw?.rawEvent?.endDate;
    end = endRaw ? formatStamp(endRaw) : "—";
    duration = endRaw ? formatDuration(report?.authoredAt, endRaw) || "—" : "—";
    // Cloudflare carries no signal datasource; show a neutral pill so the band
    // structure (and thus the dividers) matches IODA cards in a mixed set.
    signal = "Traffic Anomaly";
    bgColor = "bg-slate-500";
  } else {
    // IODA
    end = formatStamp(raw?.ended);
    duration = formatDuration(report?.authoredAt, raw?.ended) || "—";
    const [name, color] = signalToNameColor(raw?.rawEvent?.datasource);
    signal = name;
    bgColor = color || "bg-slate-500";
  }

  // The chart value is usually a media-storage key (served at /media/<key>) but may
  // be a legacy inline SVG string or an absolute URL. Branch on the shape.
  let chart: JSX.Element;
  if (!image) {
    chart = <span className='text-slate-400 dark:text-gray-500'>Loading chart…</span>;
  } else if (isInlineSvg(image)) {
    const svg = image
      .replace('width="726"', 'width="100%"')
      .replace('width="733"', 'width="100%"')
      .replace('height="514"', 'height="auto"');
    chart = (
      <div
        className='w-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-full'
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  } else {
    chart = (
      <img
        src={resolveMediaUrl(image)}
        alt='Event chart'
        className='max-w-full max-h-full object-contain'
      />
    );
  }

  const divider = <div className='border-t border-slate-200 dark:border-gray-700' />;

  return (
    <div className='h-full min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-slate-300 overflow-hidden text-xs'>
      {/* Header — pr-9 reserves space for the ⋯ menu CompareAlertCard absolutely
          positions in the top-right corner. */}
      <div className='h-9 shrink-0 flex items-center justify-between px-2 pr-9'>
        <span className='flex items-center gap-1.5 text-slate-600 dark:text-gray-400'>
          <SocialMediaIcon mediaKey={media} />
          <span className='font-semibold uppercase'>{platformLabel}</span>
        </span>
        {!!report.url && (
          <a
            target='_blank'
            rel='noreferrer'
            href={report.url}
            onClick={(e) => e.stopPropagation()}
            className='px-2 py-1 rounded-full border border-slate-200 font-medium inline-flex gap-1 items-center bg-slate-100 dark:bg-gray-700 hover:bg-white dark:hover:bg-gray-800 whitespace-nowrap'
          >
            <span>Open Post</span>
            <FontAwesomeIcon icon={faExternalLink} />
          </a>
        )}
      </div>
      {divider}

      <h2
        className='h-7 shrink-0 flex items-center px-2 font-semibold truncate'
        title={report.author}
      >
        {report.author}
      </h2>
      {divider}

      <div className='h-[4.5rem] shrink-0 flex flex-col justify-center gap-0.5 px-2'>
        <div className='flex gap-2 truncate'>
          <span className='font-semibold'>Start:</span>
          <span className='text-slate-700 dark:text-gray-300 truncate'>{start}</span>
        </div>
        <div className='flex gap-2 truncate'>
          <span className='font-semibold'>End:</span>
          <span className='text-slate-700 dark:text-gray-300 truncate'>{end}</span>
        </div>
        <div className='flex gap-2 truncate'>
          <span className='font-semibold'>Duration:</span>
          <span className='text-slate-700 dark:text-gray-300 truncate'>{duration}</span>
        </div>
      </div>
      {divider}

      <div className='h-9 shrink-0 flex items-center px-2'>
        <span
          className={`flex-1 text-center text-white dark:text-gray-300 rounded-full px-2 py-1 ${bgColor}`}
        >
          {signal}
        </span>
      </div>
      {divider}

      <div className='flex-1 min-h-0 overflow-hidden px-2 py-1 flex items-center justify-center'>
        {chart}
      </div>
      {divider}

      <div className='h-7 shrink-0 flex items-center gap-1 px-2 text-slate-500 dark:text-gray-400'>
        <span className='font-semibold'>Updated:</span>
        <DateTime dateString={report.fetchedAt} />
      </div>
    </div>
  );
};

export default CompareCardBody;
