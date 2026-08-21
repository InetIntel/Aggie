import { useState } from "react";

import { isInlineSvg, resolveMediaUrl } from "./reportParser";
import ChartExpander from "./ChartExpander";

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

// <img> with a loading skeleton — a pulsing placeholder stands in until the image
// loads so the row doesn't jump. The caller keys ExpandableChart on the image src,
// so switching reports remounts this instead of briefly showing the stale chart.
const LoadingImage = ({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className='relative'>
      {!loaded && (
        <div className='flex items-center justify-center w-full h-48 rounded bg-slate-100 dark:bg-gray-700 text-slate-400 text-sm animate-pulse'>
          Loading…
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={loaded ? className : "hidden"}
      />
    </div>
  );
};

/**
 * Renders an IODA/Cloudflare outage chart (inline SVG or <img>) with click-to-enlarge
 * in compact contexts. The image surface is fully clickable to toggle enlarge (via
 * ChartExpander); the toggle chrome is shared with the recharts IodaChart path.
 */
const ExpandableChart = ({ image, alt, compact }: IProps) => {
  if (!image) return null;

  const svg = isInlineSvg(image) ? image : "";

  return (
    <ChartExpander compact={compact}>
      {(enlarged) => {
        const capped = compact && !enlarged;
        return svg ? (
          <div
            className={
              capped
                ? "overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-52"
                : "[&_svg]:w-full [&_svg]:h-auto"
            }
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <LoadingImage
            src={resolveMediaUrl(image)}
            alt={alt}
            className={
              capped
                ? "w-full max-h-52 object-contain object-center"
                : "w-full h-auto"
            }
          />
        );
      }}
    </ChartExpander>
  );
};

export default ExpandableChart;
