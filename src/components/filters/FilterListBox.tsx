import { Listbox } from "@headlessui/react";
import FilterDropdown from "./FilterDropdown";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps<T> {
  label: string;
  options: T[];
  value: T | T[];
  onChange: (item: T | T[]) => void;
  isMultiSelect?: boolean;
}

const FilterListBox = <T extends string>({
  label,
  options,
  value,
  onChange,
  isMultiSelect = false,
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
      value={displayValue()}
      onReset={() => onChange(isMultiSelect ? [] : ("" as T))}
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
                className='px-2 py-1 flex justify-between items-center w-full bg-[#fff] cursor-pointer hover:bg-slate-100 ui-active:bg-slate-100'
              >
                {item}
                {(value === item || selected.includes(item)) && (
                  <FontAwesomeIcon icon={faCheck} className='text-slate-600' />
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Listbox>
      )}
    </FilterDropdown>
  );
};

export default FilterListBox;
