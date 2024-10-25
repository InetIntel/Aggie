import AggieButton from "../AggieButton";
import { Field, useField } from "formik";

interface IProps {
  size?: number;
  labelLeft: string;
  labelRight: string;
  name: string;
}
const AIFeedbackScale = ({ name, size = 5, labelLeft, labelRight }: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue } = helpers;

  return (
    <div>
      <div className='text-xs font-medium text-slate-600 flex justify-between'>
        <p>{labelLeft}</p>
        <p>{labelRight}</p>
      </div>
      <div className='flex border border-slate-300 rounded-lg h-fit overflow-hidden'>
        {Array(size)
          .fill(0)
          .map((i, index) => (
            <AggieButton
              key={index}
              type={"button"}
              onClick={() => setValue(index)}
              className={`px-2 py-1 hover:bg-slate-50 ${
                value === index
                  ? "pointer-events-none bg-slate-600 text-white"
                  : "bg-white"
              }`}
            >
              {index + 1}
            </AggieButton>
          ))}
      </div>
    </div>
  );
};

export default AIFeedbackScale;
