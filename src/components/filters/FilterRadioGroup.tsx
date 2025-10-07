import { RadioGroup } from "@headlessui/react";

interface IProps {
  options: Record<string, React.ReactNode>;
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
}

const FilterRadioGroup = ({
  options,
  value,
  onChange,
  defaultValue,
}: IProps) => {
  const OptionStyle =
    "ui-not-checked:px-1 py-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded cursor-pointer transition font-medium dark:text-gray-300";
  const OptionCheckedStyle =
    "ui-checked:px-2 ui-checked:pointer-events-none  ui-checked:text-black ui-checked:bg-slate-200 dark:ui-checked:bg-gray-600 dark:ui-checked:text-[#d8d4ef]";
  return (
    <RadioGroup
      className='flex items-center gap-1  text-slate-700 dark:text-gray-300 underline-offset-2'
      value={value ? value : defaultValue}
      onChange={onChange}
    >
      {Object.entries(options).map(([k, v]) => (
        <RadioGroup.Option
          value={k}
          key={k}
          className={`${OptionStyle} ${OptionCheckedStyle}`}
        >
          {v}
        </RadioGroup.Option>
      ))}
    </RadioGroup>
  );
};

export default FilterRadioGroup;
