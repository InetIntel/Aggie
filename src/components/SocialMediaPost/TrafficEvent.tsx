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
      <h2 className='font-bold'>{report?.author}</h2>
      <p className=' mb-1'>
        {
          report?.authoredAt?.replace('T', ' ').replace(':00.000Z', '')
        } - {endDate} UTC
      </p>
      <img src={rawData?.image} alt='traffic trend' />
    </>
  );
};

export default TrafficEvent;
