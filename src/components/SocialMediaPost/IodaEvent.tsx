import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";
import { signalToNameColor } from "../SocialMediaPost/reportParser";
import AggieToken from "../AggieToken";

interface IProps {
  report: Report;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
}

const IodaEvent = ({ report, compact }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const start = report?.authoredAt?.replace('T', ' ').substring(0, 16);
  const end = rawData?.ended?.replace('T', ' ').substring(0, 16);
  console.log(rawData?.ended, end);

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
          className={`${bgColor} rounded-lg text-white dark:text-gray-300 ${
            compact ? "p-0.5 text-xs" : "p-1 text-sm"
          }`}
        >
          {signal}
        </AggieToken>
      </div>
      <p className='mb-1'>
        {start} - {end} UTC
      </p>
      <div
        className={
          compact
            ? "overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-52"
            : undefined
        }
        dangerouslySetInnerHTML={{ __html: image }}
      />
    </>
  );
};

export default IodaEvent;
