import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}
const IODAEvent = ({ report }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const start = report?.authoredAt.replace('T', ' ').replace(':00.000Z', '');
  const end = new Date((rawData?.start + rawData?.duration) * 1000);
  const endUtc = end.toISOString().replace('T', ' ').replace(':00.000Z', '');

  const rawSignal = rawData?.datasource;
  let signal = "unknown";
  if (rawSignal === "bgp") {
    signal = "BGP";
  } else if (rawSignal === "ping-slash24") {
    signal = "Active Probing";
  } else if (rawSignal === "merit-nt") {
    signal = "Telescope";
  }

  return (
    <>
      <h2 className='font-medium'>{rawData?.location_name}</h2>
      <p className=' mb-1'>
        signal triggered: {signal}<br />
        {start} - {endUtc} UTC
      </p>
    </>
  );
};

export default IODAEvent;
