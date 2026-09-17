import ReactTimeAgo from "react-time-ago";
import { useFormatters } from "../utils/useFormatters";

const stringToDate = (str: string) => {
  if (!str) return undefined;
  return new Date(str);
};

interface IPropsDateString {
  dateString: string | undefined;
  date?: never;
}
interface IPropsDate {
  dateString?: never;
  date: Date | undefined;
}
type IProps = IPropsDate | IPropsDateString;
const DateTime = (props: IProps) => {
  const { formatDate, formatTime } = useFormatters();
  const date =
    "date" in props && !!props.date
      ? props.date
      : stringToDate(props.dateString || "");

  if (!date) return <></>;
  function timeOrDate(d: Date) {
    const today = new Date();
    if (d.getDate() === today.getDate() && d.getMonth() === today.getMonth())
      return `ago (${formatTime(d)})`;
    return formatDate(d);
  }

  return (
    <>
      <span className='font-medium'>
        <ReactTimeAgo date={date} locale='en-US' timeStyle='twitter' />
      </span>{" "}
      {timeOrDate(date)}
    </>
  );
};

export default DateTime;
