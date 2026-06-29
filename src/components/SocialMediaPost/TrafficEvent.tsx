import { useState } from "react";
import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}

const TrafficImage = ({ src }: { src: string }) => {
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
        className={loaded ? "" : "hidden"}
      />
    </div>
  );
};

// cloudflare traffic anomaly
const TrafficEvent = ({ report }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const endDate = rawData?.rawEvent?.endDate || "now";
  const image = rawData?.image;
  return (
    <>
      <h2 className='font-medium'>{report?.author}</h2>
      <p className='mb-1'>
        {
          report?.authoredAt?.replace('T', ' ').substring(0, 16)
        } - {endDate.replace('T', ' ').substring(0, 16)} UTC
      </p>
      {image ? <TrafficImage key={image} src={image} /> : null}
    </>
  );
};

export default TrafficEvent;
