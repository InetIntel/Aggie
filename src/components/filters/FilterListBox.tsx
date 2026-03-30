import { Listbox } from "@headlessui/react";
import FilterDropdown from "./FilterDropdown";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import AggieSwitch from "../AggieSwitch";

interface IProps<T> {
  label: string;
  options: T[];
  value: T | T[];
  onChange: (item: T | T[]) => void;
  isMultiSelect?: boolean;
  toggleLabel?: string;
  toggleValue?: boolean;
  onToggleChange?: (value: boolean) => void;
}

const FilterListBox = <T extends string>({
  label,
  options,
  value,
  onChange,
  isMultiSelect = false,
  toggleLabel,
  toggleValue = false,
  onToggleChange,
}: IProps<T>) => {

  const selected = isMultiSelect ? value as T[] : [value as T];

  const handleSelect = (selected: T | T[]) => {
    onChange(selected);
  }

  const displayValue = () => {
    return isMultiSelect
      ? (selected.length > 0 ? selected.join(","): undefined)
      : (value as string);
  }


  return (
    <FilterDropdown
      label={label}
      value={isMultiSelect ? undefined : displayValue()}
      onReset={() => onChange(isMultiSelect ? [] : ("" as T))}
      panelClassName="w-56"
    >
      {({ close }) => (
        <Listbox
          value={value}
          onChange={(e) => {
            handleSelect(e);
            if (!isMultiSelect) close();
          }}
          multiple={isMultiSelect}
        >
          <Listbox.Options static className='divide-y divide-slate-200 m-0 p-0'>
            {options.map((item) => (
              <Listbox.Option
                value={item}
                key={item}
                className='px-2 py-1 flex items-center gap-2 w-full bg-white dark:bg-gray-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-gray-700 ui-active:bg-slate-100 dark:ui-active:bg-gray-700'
              >
                {isMultiSelect && (
                  <div className='flex items-center justify-center w-4 h-4 border border-slate-400 dark:border-gray-500 rounded bg-white dark:bg-gray-700'>
                    {selected.includes(item) && (
                      <FontAwesomeIcon icon={faCheck} className='text-slate-600 dark:text-gray-400 text-xs' />
                    )}
                  </div>
                )}
                {item}
              </Listbox.Option>
            ))}
            {toggleLabel && onToggleChange && (
              <div className='px-2 py-2 border-t border-slate-300 dark:border-gray-600 flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-gray-750'>
                <AggieSwitch
                  checked={toggleValue}
                  onChange={() => onToggleChange(!toggleValue)}
                  label={toggleLabel}
                />
                <label className='text-sm cursor-pointer flex-1'>{toggleLabel}</label>
              </div>
            )}
          </Listbox.Options>
        </Listbox>
      )}
    </FilterDropdown>
  );
};

export default FilterListBox;
