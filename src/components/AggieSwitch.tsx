import { Switch } from "@headlessui/react";

interface IProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
}
const AggieSwitch = ({
  checked,
  onChange,
  label = "turn on or off",
  disabled = false,
}: IProps) => {
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className={`${
        checked ? "bg-blue-600 dark:bg-blue-600 dark:saturate-[0.7]" : "bg-gray-200"
      } relative inline-flex h-6 w-11 items-center rounded-full border border-slate-300 disabled:pointer-events-none disabled:opacity-75`}
    >
      <span className='sr-only'>{label}</span>
      <span
        className={`${
          checked ? "translate-x-6" : "translate-x-1"
        } inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-800 transition border border-slate-400`}
      />
    </Switch>
  );
};

export default AggieSwitch;
