import { useState } from "react";
import { useField } from "formik";

import {
  faCheck,
  faChevronDown,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Combobox } from "@headlessui/react";

interface IProps {
  label: string;
  name: string;
  list: { _id: string; label: string }[];
  disabled?: boolean;
  placeholder?: string;
  icon?: IconProp;
}

// Single-select dropdown with type-to-filter search, for long option lists
// (e.g. the ~250-country pickers) where FormikDropdown's Listbox type-ahead
// (prefix-jump only) isn't enough. Headless-ui Combobox gives a real search
// input that filters as you type.
const FormikCombobox = ({
  label,
  name,
  list,
  disabled = false,
  placeholder,
  icon,
}: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue } = helpers;
  const [query, setQuery] = useState("");

  const filtered =
    query.trim() === ""
      ? list
      : list.filter((item) =>
          item.label.toLowerCase().includes(query.trim().toLowerCase())
        );

  return (
    <div>
      <label className='text-slate-600 dark:text-gray-400'>
        {icon && <FontAwesomeIcon icon={icon} />} {label}
      </label>
      <Combobox
        value={value ?? ""}
        onChange={(next) => setValue(next)}
        disabled={disabled}
      >
        <div
          className={`relative font-medium ${
            disabled ? "pointer-events-none opacity-75" : ""
          }`}
        >
          <div className='flex items-center bg-slate-50 dark:bg-gray-900 border border-slate-300 rounded focus-within:ring-2 focus-within:ring-blue-400'>
            <Combobox.Input
              className='px-3 py-2 flex-1 bg-transparent focus:outline-none text-black dark:text-gray-300 rounded'
              displayValue={(v: string) =>
                list.find((i) => i._id === v)?.label || ""
              }
              onChange={(e) => setQuery(e.target.value)}
              onBlur={field.onBlur}
              placeholder={placeholder || "Search " + label}
            />
            <Combobox.Button className='px-3 py-2 text-slate-400 dark:text-gray-400'>
              <FontAwesomeIcon icon={faChevronDown} className='ui-open:rotate-180' />
            </Combobox.Button>
          </div>
          <Combobox.Options className='absolute left-0 mt-1 right-0 max-h-60 overflow-y-auto shadow-md border border-slate-300 bg-white dark:bg-gray-800 rounded z-10'>
            {filtered.length === 0 ? (
              <div className='px-3 py-2 text-slate-500 dark:text-gray-400'>
                No matches
              </div>
            ) : (
              filtered.map((item) => (
                <Combobox.Option
                  key={item._id}
                  value={item._id}
                  className='flex justify-between px-3 py-2 ui-active:bg-slate-100 dark:ui-active:bg-gray-700 ui-selected:bg-slate-100 dark:ui-selected:bg-gray-700 cursor-pointer items-center'
                >
                  {item.label}
                  <FontAwesomeIcon
                    icon={faCheck}
                    className={`text-slate-400 dark:text-gray-400 ${
                      item._id === value ? "" : "hidden"
                    }`}
                  />
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </div>
      </Combobox>
      {meta.touched && meta.error ? (
        <p className='text-orange-600 my-1 ml-1 inline-flex gap-1 items-center text-sm'>
          <FontAwesomeIcon icon={faExclamationTriangle} size='sm' />
          {meta.error}
        </p>
      ) : null}
    </div>
  );
};

export default FormikCombobox;
