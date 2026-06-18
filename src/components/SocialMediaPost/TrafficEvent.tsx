import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}

// cloudflare traffic anomaly
const TrafficEvent = ({ report }: IProps) => {
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
      <img src={rawData?.imageUrl} alt='traffic trend' />
    </>
  );
};

export default TrafficEvent;
