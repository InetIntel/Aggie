import { useState } from "react";
import {
  faExternalLink,
  faUpRightAndDownLeftFromCenter,
  faDownLeftAndUpRightToCenter,
} from "@fortawesome/free-solid-svg-icons";
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
  /**
   * Single-row comparison (≤3 cards): render the chart width-driven (fill the
   * card width, natural height) so the card fits its content with no vertical
   * whitespace. When false, the chart fits to a fixed-height band and a per-card
   * enlarge button is offered instead.
   */
  fillWidth?: boolean;
}

// Bespoke presentational card for the alerts compare modal. Unlike SocialMediaPost
// it lays content out in IDENTICAL fixed-height bands (header / title / times /
// signal / footer) with the chart as the flex remainder, so the dividers between
// bands sit at the same vertical offset across every card in the equal-height grid.
// Purely presentational — no read-on-view side effect.
const CompareCardBody = ({ report, fillWidth }: IProps) => {
  // When enlarged, the chart overlays the whole card (full width) so it's
  // readable even in a cramped 4-6 card grid; the ✕ collapses it back.
  const [zoomed, setZoomed] = useState(false);
  const media = report._media?.[0];
  const raw = report?.metadata?.rawAPIResponse;
  const isOoni = media === "ooni";
  const platformLabel = media === "cloudflare" ? "Cloudflare" : isOoni ? "OONI" : "IODA";

  // The reports LIST endpoint strips metadata.rawAPIResponse.image (the chart, now a
  // media-storage key) to keep payloads small, so it's absent on the report objects
  // fed into the compare modal. The hook lazily fetches the full report per card.
  const image = useReportChartImage(report, !isOoni);

  const start = formatStamp(report?.authoredAt);

  let end: string;
  let duration: string;
  let signal: string;
  let bgColor: string;

  if (isOoni) {
    end = "—";
    duration = "Daily measurement";
    signal = "Zero Measurements";
    bgColor = "bg-red-600";
  } else if (media === "cloudflare") {
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
  if (isOoni) {
    const trigger = raw?.triggers?.[0];
    chart = (
      <dl className='grid w-full grid-cols-2 gap-3 text-sm'>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>Network</dt>
          <dd className='font-semibold'>{raw?.networkName || report.author}</dd>
        </div>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>ASN</dt>
          <dd className='font-semibold'>{raw?.probeASN ? `AS${raw.probeASN}` : "—"}</dd>
        </div>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>Measurement day</dt>
          <dd className='font-semibold'>{trigger?.measurementDay || "—"}</dd>
        </div>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>Measurements</dt>
          <dd className='font-semibold'>{trigger?.measurementCount ?? 0}</dd>
        </div>
      </dl>
    );
  } else if (!image) {
    chart = <span className='text-slate-400 dark:text-gray-500'>Loading chart…</span>;
  } else if (isInlineSvg(image)) {
    chart = (
      <div
        className={
          fillWidth
            ? "w-full [&_svg]:w-full [&_svg]:h-auto"
            : "w-full h-full flex items-center justify-center overflow-hidden [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-full"
        }
        dangerouslySetInnerHTML={{ __html: image }}
      />
    );
  } else {
    chart = (
      <img
        src={resolveMediaUrl(image)}
        alt='Event chart'
        className={
          fillWidth ? "w-full h-auto" : "max-w-full max-h-full object-contain"
        }
      />
    );
  }

  const divider = <div className='border-t border-slate-200 dark:border-gray-700' />;

  return (
    <div className='relative h-full min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-slate-300 overflow-hidden text-xs'>
      {/* Header — pr-9 reserves space for the ⋯ menu CompareAlertCard absolutely
          positions in the top-right corner. */}
      <div className='h-9 shrink-0 flex items-center justify-between gap-2 px-2 pr-10'>
        <span className='flex items-center gap-1.5 min-w-0 text-slate-600 dark:text-gray-400'>
          <SocialMediaIcon mediaKey={media} />
          <span className='font-semibold uppercase truncate'>
            {platformLabel}
          </span>
        </span>
        {!!report.url && (
          <a
            target='_blank'
            rel='noreferrer'
            href={report.url}
            onClick={(e) => e.stopPropagation()}
            className='shrink-0 px-2 py-1 rounded-full border border-slate-200 font-medium inline-flex gap-1 items-center bg-slate-100 dark:bg-gray-700 hover:bg-white dark:hover:bg-gray-800 whitespace-nowrap'
          >
            <span>Open Post</span>
            <FontAwesomeIcon icon={faExternalLink} />
          </a>
        )}
      </div>
      {divider}

      <h2
        className='h-10 shrink-0 px-2 py-1 font-semibold leading-tight line-clamp-2'
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

      <div
        className={`relative overflow-hidden px-2 py-1 flex items-center justify-center ${
          fillWidth ? "shrink-0" : "flex-1 min-h-[8rem]"
        }`}
      >
        {chart}
        {!isOoni && !fillWidth && !!image && (
          <button
            type='button'
            title='Enlarge chart'
            aria-label='Enlarge chart'
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(true);
            }}
            className='absolute bottom-1 right-1 px-1.5 py-1 rounded-md border border-slate-300 bg-white/90 dark:bg-gray-800/90 text-slate-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
          >
            <FontAwesomeIcon icon={faUpRightAndDownLeftFromCenter} />
          </button>
        )}
      </div>
      {divider}

      <div className='h-7 shrink-0 flex items-center gap-1 px-2 text-slate-500 dark:text-gray-400'>
        <span className='font-semibold'>Updated:</span>
        <DateTime dateString={report.fetchedAt} />
      </div>

      {/* Enlarged view: the chart fills the whole card (full width) over the
          metadata bands so it's readable in a cramped grid; ✕ collapses it. */}
      {!isOoni && zoomed && !!image && (
        <div
          className='absolute inset-0 z-20 bg-white dark:bg-gray-800 flex items-center justify-center p-2'
          onClick={(e) => e.stopPropagation()}
        >
          {chart}
          <button
            type='button'
            title='Close enlarged chart'
            aria-label='Close enlarged chart'
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(false);
            }}
            className='absolute top-1 right-1 px-1.5 py-1 rounded-md border border-slate-300 bg-white/90 dark:bg-gray-800/90 text-slate-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
          >
            <FontAwesomeIcon icon={faDownLeftAndUpRightToCenter} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CompareCardBody;
