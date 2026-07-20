import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpRightAndDownLeftFromCenter,
  faDownLeftAndUpRightToCenter,
} from "@fortawesome/free-solid-svg-icons";

import { isInlineSvg, resolveMediaUrl } from "./reportParser";

interface IProps {
  /** Storage key | absolute URL | legacy inline SVG string. */
  image?: string;
  alt: string;
  /**
   * Compact contexts (table/list expanded rows, compare grid) cap the chart
   * height and enable click-to-enlarge. Non-compact renders full-size, no toggle.
   */
  compact?: boolean;
}

/**
 * Renders an IODA/Cloudflare outage chart (inline SVG or <img>). In compact mode
 * the chart is capped and clicking it enlarges it inline to the container's full
 * width / natural height, with a Collapse button to shrink it back. Enlarge state
 * is local so each expanded row toggles independently.
 */
const ExpandableChart = ({ image, alt, compact }: IProps) => {
  const [enlarged, setEnlarged] = useState(false);
  if (!image) return null;

  const svg = isInlineSvg(image) ? image : "";
  const capped = compact && !enlarged;

  const chart = svg ? (
    <div
      className={
        capped
          ? "overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-52"
          : "[&_svg]:w-full [&_svg]:h-auto"
      }
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <img
      src={resolveMediaUrl(image)}
      alt={alt}
      className={
        capped
          ? "w-full max-h-52 object-contain object-center"
          : "w-full h-auto"
      }
    />
  );

  // Non-compact standalone view: unchanged, full-size, no toggle.
  if (!compact) return chart;

  return (
    <div className='relative'>
      {enlarged ? (
        <div
          className='cursor-zoom-out'
          onClick={(e) => {
            e.stopPropagation();
            setEnlarged(false);
          }}
        >
          {chart}
          <button
            type='button'
            onClick={(e) => {
              e.stopPropagation();
              setEnlarged(false);
            }}
            title='Collapse chart'
            aria-label='Collapse chart'
            className='absolute top-1 right-1 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white/90 dark:bg-gray-800/90 px-2 py-1 text-xs font-medium text-slate-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 shadow-sm'
          >
            <FontAwesomeIcon icon={faDownLeftAndUpRightToCenter} />
            Collapse
          </button>
        </div>
      ) : (
        <div
          className='cursor-zoom-in'
          onClick={(e) => {
            e.stopPropagation();
            setEnlarged(true);
          }}
        >
          {chart}
          <button
            type='button'
            onClick={(e) => {
              e.stopPropagation();
              setEnlarged(true);
            }}
            title='Expand chart'
            aria-label='Expand chart'
            className='absolute top-1 right-1 inline-flex items-center rounded-full border border-slate-300 bg-white/90 dark:bg-gray-800/90 p-1.5 text-xs text-slate-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 shadow-sm'
          >
            <FontAwesomeIcon icon={faUpRightAndDownLeftFromCenter} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ExpandableChart;
