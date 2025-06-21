import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}
const IodaEvent = ({ report }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const start = report?.authoredAt.replace('T', ' ').replace(':00.000Z', '');
  const endUtc = rawData?.ended?.replace('T', ' ').replace(':00.000Z', '');

  const rawSignal = rawData?.rawEvent?.datasource;
  let signal = "unknown";
  let bgColor = "";
  if (rawSignal === "bgp") {
    signal = "BGP";
    bgColor = "bg-[#33A02C]";
  } else if (rawSignal === "ping-slash24") {
    signal = "Active Probing";
    bgColor = "bg-[#1F78B4]";
  } else if (rawSignal === "merit-nt") {
    signal = "Telescope";
    bgColor = "bg-[#ED9B40]";
  }

  const image = rawData?.image.
    replace('width="726"', 'width="100%"').
    replace('height="514"', 'height="auto"');

  return (
    <>
      <div className='flex gap-2 items-center'>
        <h2 className='font-bold'>{report?.author}</h2>
        <span className={bgColor + " p-1 rounded-lg text-white text-xs"}>{signal}</span>
      </div>
      <p className='mb-1'>
        {start} - {endUtc} UTC
      </p>
      <div dangerouslySetInnerHTML={{ __html: image }} />
    </>
  );
};

export default IodaEvent;
