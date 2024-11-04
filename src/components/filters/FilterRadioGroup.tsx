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
    "ui-not-checked:px-1 py-1 hover:bg-slate-100 rounded cursor-pointer hover:underline transition font-medium";
  const OptionCheckedStyle =
    "ui-checked:px-2 ui-checked:pointer-events-none  ui-checked:text-black ui-checked:bg-slate-200 ";
  return (
    <RadioGroup
      className='flex items-center gap-1  text-slate-700  underline-offset-2 font-normal'
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
