import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
}

// cloudflare traffic anomaly
const TrafficEvent = ({ report, compact }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const endDate = rawData?.rawEvent?.endDate || "now";
  return (
    <>
      <h2 className='font-medium'>{report?.author}</h2>
      <p className='mb-1'>
        {
          report?.authoredAt?.replace('T', ' ').substring(0, 16)
        } - {endDate.replace('T', ' ').substring(0, 16)} UTC
      </p>
      <img
        src={rawData?.image}
        alt='traffic trend'
        className={compact ? "w-full max-h-52 object-contain object-left-top" : undefined}
      />
    </>
  );
};

export default TrafficEvent;
