import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}
const IODAEvent = ({ report }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const content = report.content;
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
      <p className=' mb-1'>signal triggered: {signal}</p>
      <div
        className='whitespace-pre-line mb-1 rsspost'
        dangerouslySetInnerHTML={{ __html: content }}
      ></div>
    </>
  );
};

export default IODAEvent;
