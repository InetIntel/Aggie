import { Report } from "../../api/reports/types";
import { signalToNameColor } from "../SocialMediaPost/reportParser";
import AggieToken from "../AggieToken";

interface IProps {
  report: Report;
}

const IodaEvent = ({ report }: IProps) => {
  const rawData = report?.metadata?.rawAPIResponse;
  const start = report?.authoredAt?.replace('T', ' ').substring(0, 16);
  const end = rawData?.ended?.replace('T', ' ').substring(0, 16);
  console.log(rawData?.ended, end);

  const rawSignal = rawData?.rawEvent?.datasource;
  let [signal, bgColor] = signalToNameColor(rawSignal);

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
        {start} - {end} UTC
      </p>
      <img src={rawData?.imageUrl} alt='outage chart' className='w-full h-auto' />
    </>
  );
};

export default IodaEvent;
