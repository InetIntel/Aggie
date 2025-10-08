import { faThumbsUp, faThumbsDown } from "@fortawesome/free-solid-svg-icons";
import AggieButton from "../AggieButton";

interface IProps {
  onClick: (e: boolean) => void;
  value: boolean | undefined;
}
const AIFeedbackBool = ({ onClick, value }: IProps) => {
  return (
    <div className='flex gap-1'>
      <AggieButton
        icon={faThumbsUp}
        className={`px-2 py-1 hover:bg-slate-50 dark:hover:bg-gray-900 rounded-lg ${
          value === true
            ? "pointer-events-none bg-slate-600 dark:bg-gray-300 text-white dark:text-gray-300 "
            : "bg-white dark:bg-gray-800"
        }`}
        onClick={() => onClick(true)}
      ></AggieButton>
      <AggieButton
        variant='secondary'
        icon={faThumbsDown}
        onClick={() => onClick(false)}
        className={`px-2 py-1 hover:bg-slate-50 dark:hover:bg-gray-900 rounded-lg ${
          value === false
            ? "pointer-events-none bg-slate-600 dark:bg-gray-300 text-white dark:text-gray-300 "
            : "bg-white dark:bg-gray-800"
        }`}
      ></AggieButton>
    </div>
  );
};

export default AIFeedbackBool;
