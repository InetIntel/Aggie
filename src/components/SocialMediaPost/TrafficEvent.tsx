import { useState } from "react";
import { Report } from "../../api/reports/types";
import { resolveMediaUrl } from "../SocialMediaPost/reportParser";
import { useReportChartImage } from "./useReportChartImage";

interface IProps {
  report: Report;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
}

const TrafficImage = ({
  src,
  className,
}: {
  src: string;
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
        alt='traffic trend'
        onLoad={() => setLoaded(true)}
        className={loaded ? className : "hidden"}
      />
    </div>
  );
};

// cloudflare traffic anomaly
const TrafficEvent = ({ report, compact }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const endDate = rawData?.rawEvent?.endDate || "now";
  // Chart is a media-storage key (served at /media/...) or a legacy absolute URL;
  // fetched lazily when the list query stripped it.
  const image = useReportChartImage(report);
  return (
    <>
      <h2 className='font-medium'>{report?.author}</h2>
      <p className='mb-1'>
        {
          report?.authoredAt?.replace('T', ' ').substring(0, 16)
        } - {endDate.replace('T', ' ').substring(0, 16)} UTC
      </p>
      {!!image && (
        // Key on the resolved src so switching reports remounts the <img>
        // instead of reusing the DOM node and briefly showing the stale chart.
        <TrafficImage
          key={image}
          src={resolveMediaUrl(image)}
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

export default TrafficEvent;
