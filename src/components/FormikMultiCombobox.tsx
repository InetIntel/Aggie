// yeah.... i gotta refactor this one
import { debounce } from "lodash";
import { useCallback, useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClose,
  faCheck,
  faCaretDown,
  faPlus,
  faXmark,
  faCog,
} from "@fortawesome/free-solid-svg-icons";
import { useField } from "formik";
import { Combobox, Popover } from "@headlessui/react";
import AggieButton from "./AggieButton";
interface Item {
  key: string;
  value: string;
}

interface IProps {
  label?: string;
  unitLabel?: string;
  name: string;
  list: Item[];
  optionalItems?: Item[];
}

const FormikMultiCombobox = ({
  name,
  list,
  label,
  unitLabel = "item",
}: IProps) => {
  const [field, meta, helpers] = useField(name);
  const { value } = meta;
  const { setValue, setTouched } = helpers;

  const [filteredList, setFilteredList] = useState(list);
  const [rawSearch, setRawSearch] = useState("");

  useEffect(() => {
    if (!list) return;
    setFilteredList(list);
  }, [list]);

  function onSearch(query: string) {
    if (!query || !query.trim()) {
      setFilteredList(list);
    }
    const filtered = list.filter((i) =>
      i.value.toLowerCase().includes(query.trim().toLowerCase())
    );
    setFilteredList(filtered);
  }
  const doFilterList = useCallback(debounce(onSearch, 150), [list]);

  function clearSearch() {
    setRawSearch("");
    setFilteredList(list);
  }

  function addRemoveItem(key: string) {
    if (!Array.isArray(value)) return;
    setTouched(true);

    if (!value.some((i: string) => i === key)) {
      //key isnt selected
      setValue([...value, key].sort());
      return;
    }
    const removeKey = value.filter((i: string) => i !== key);
    setValue(removeKey);
  }

  function valueFromLists(key: string) {
    const listValue = list.find((i) => i.key === key)?.value;
    if (!!listValue) return listValue;

    return undefined;
  }
  return (
    <Popover className='relative'>
      <div className='flex items-center justify-between text-slate-600'>
        <h2>{label}</h2>
        <Popover.Button
          className={({ open }) =>
            `focus-theme pl-2 pr-1 py-1 hover:bg-slate-200 ${
              open ? "bg-slate-100" : ""
            } rounded flex items-center gap-1 font-medium text-sm  hover:underline`
          }
        >
          Add / Remove {unitLabel}
          <FontAwesomeIcon icon={faCog} className=' mr-1 text-slate-500' />
        </Popover.Button>
      </div>
      <div className='flex flex-wrap gap-2'>
        {value && value.length > 0 ? (
          value?.map((selected: string) => (
            <div
              key={selected}
              className='pl-2 pr-1 rounded-full bg-slate-100 flex gap-1 items-center '
            >
              {valueFromLists(selected)}
              <button
                type='button'
                onClick={() => addRemoveItem(selected)}
                className='rounded-full h-5 w-5 bg-white hover:bg-red-100 hover:text-red-700 grid place-items-center border border-slate-300'
              >
                <FontAwesomeIcon icon={faXmark} size='sm' />
              </button>
            </div>
          ))
        ) : (
          <p className='flex'>No {unitLabel} Added</p>
        )}
        <div className='relative'></div>

        <Popover.Panel className='text-sm font-medium absolute py-2 mt-1 right-0 rounded-lg border border-slate-300  bg-slate-100 overflow-hidden min-w-[12em] max-h-[30em] drop-shadow-lg z-10'>
          {({ close }) => (
            <>
              <div className='px-2 pb-2 border-b border-slate-300'>
                <div className='flex justify-between items-center mb-1'>
                  <h2> Add / Remove {unitLabel}</h2>
                </div>
                <input
                  type='text'
                  placeholder='search...'
                  autoFocus={true}
                  className='focus-theme py-1 px-2 border border-slate-200 rounded w-full'
                  value={rawSearch}
                  onChange={(event) => {
                    doFilterList(event.target.value);
                    setRawSearch(event.target.value);
                  }}
                />
                {!!rawSearch && (
                  <button
                    className='px-2 mt-1 rounded hover:bg-slate-600 hover:text-slate-100 absolute right-3 text-slate-600   '
                    onClick={clearSearch}
                  >
                    <FontAwesomeIcon icon={faClose} />
                  </button>
                )}
              </div>

              {value && value.length > 0 && (
                <AggieButton
                  type='button'
                  className='border-b-2 bg-white hover:bg-red-50 hover:text-red-700 text-red-800 border-slate-300 px-2 py-1 flex gap-1 items-center w-full'
                  onClick={() => setValue([])}
                >
                  <FontAwesomeIcon icon={faClose} />
                  Clear All
                </AggieButton>
              )}

              <div className='bg-white divide-y divide-slate-200 max-h-[15em] overflow-y-auto'>
                {filteredList.length > 0 ? (
                  filteredList?.map((item) => (
                    <button
                      key={item.key}
                      type='button'
                      onClick={() => addRemoveItem(item.key)}
                      className={`hover:bg-slate-50 py-1 px-2 flex justify-between items-center w-full`}
                    >
                      {item.value}
                      {value && value?.includes(item.key) && (
                        <FontAwesomeIcon icon={faCheck} />
                      )}
                    </button>
                  ))
                ) : (
                  <p className='py-1 px-2'>No Results Found</p>
                )}
              </div>
            </>
          )}
        </Popover.Panel>
      </div>
    </Popover>
  );
};

export default FormikMultiCombobox;
