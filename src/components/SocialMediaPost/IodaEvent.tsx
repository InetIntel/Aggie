import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";
import { signalToNameColor } from "../SocialMediaPost/reportParser";
import AggieToken from "../AggieToken";

interface IProps {
  report: Report;
}

const IodaEvent = ({ report }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const start = report?.authoredAt?.replace('T', ' ').substring(0, 16);
  // An ongoing outage has no end time yet — IODA only reports elapsed time so far.
  const isOngoing = rawData?.isOngoing === true;
  const end = isOngoing
    ? "Present"
    : rawData?.ended?.replace('T', ' ').substring(0, 16);

  const rawSignal = rawData?.rawEvent?.datasource;
  let [signal, bgColor] = signalToNameColor(rawSignal);

  const image = rawData?.image?.
    replace('width="726"', 'width="100%"').
    replace('width="733"', 'width="100%"').
    replace('height="514"', 'height="auto"') || "";

  return (
    <>
      <div className='flex gap-2 items-center'>
        <h2 className='font-medium'>{report?.author}</h2>
        <AggieToken
          className={`${bgColor} p-1 rounded-lg text-sm text-white dark:text-gray-300 `}
        >
          {signal}
        </AggieToken>
      </div>
      <p className='mb-1'>
        {isOngoing ? `${start} UTC - Present` : `${start} - ${end} UTC`}
      </p>
      <div dangerouslySetInnerHTML={{ __html: image }} />
    </>
  );
};

export default IodaEvent;
