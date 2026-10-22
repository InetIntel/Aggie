import { debounce } from "lodash";
import { useCallback, useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClose, faCheck } from "@fortawesome/free-solid-svg-icons";
import FilterDropdown from "./FilterDropdown";
interface Item<T> {
  key: string;
  value: string;
  data?: T;
  searchstring?: string;
}

interface IProps<T> {
  label: string;
  list: Item<T>[];
  optionalItems?: Item<T>[];
  onChange: (selectedItem: Item<T>) => void;
  selectedKey?: string;
  itemElement?: (a: Item<T>) => React.ReactNode;
}

const FilterComboBox = <T extends {}>({
  label,
  list,
  onChange,
  selectedKey,
  optionalItems = [],
  itemElement = (a) => <span>{a.value}</span>,
}: IProps<T>) => {
  const [filteredList, setFilteredList] = useState(list);
  const [rawSearch, setRawSearch] = useState("");

  useEffect(() => {
    if (!list) return;
    setFilteredList(list);
  }, [list]);

  function onSearch(query: string) {
    if (!query.trim()) {
      setFilteredList(list);
      return;
    }
    const filtered = list.filter((i) => {
      if (!!i.searchstring)
        return i.searchstring
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      return i.value.toLowerCase().includes(query.trim().toLowerCase());
    });
    setFilteredList(filtered);
  }
  const doSearchInput = useCallback(debounce(onSearch, 150), [filteredList]);

  function clearSearch() {
    setRawSearch("");
    setFilteredList(list);
  }

  function onSelectItem(item: Item<T>) {
    onChange(item);
    clearSearch();
  }
  function valueFromLists(key: string) {
    const listValue = list.find((i) => i.key === key)?.value;
    if (!!listValue) return listValue;

    const optionalValue = optionalItems.find((i) => i.key === key)?.value;
    if (!!optionalValue) return optionalValue;
    return undefined;
  }
  return (
    <FilterDropdown
      label={label}
      value={selectedKey && valueFromLists(selectedKey)}
      onReset={() => onSelectItem({ key: "", value: "" })}
      headerChild={
        <>
          <input
            type='text'
            placeholder='search...'
            autoFocus={true}
            className='focus-theme py-1 px-2 border border-slate-200 rounded w-full'
            value={rawSearch}
            onChange={(event) => {
              doSearchInput(event.target.value);
              setRawSearch(event.target.value);
            }}
          />
          {!!rawSearch && (
            <button
              className='px-2 mt-1 rounded hover:bg-slate-600 dark:hover:bg-gray-300 hover:text-slate-100 dark:hover:text-gray-300  absolute right-2 text-slate-600 dark:text-gray-400   '
              onClick={clearSearch}
            >
              <FontAwesomeIcon icon={faClose} />
            </button>
          )}
        </>
      }
    >
      {({ close }) => (
        <div className=' flex flex-col divide-y divide-slate-200 max-h-[20em] overflow-y-auto bg-white dark:bg-gray-800 text-start'>
          {!rawSearch && optionalItems.length > 0 && (
            <>
              {optionalItems.map((item) => (
                <button
                  className={`px-2 py-1 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-gray-900 gap-1 ${selectedKey === item.key ? "bg-slate-100 dark:bg-gray-700" : ""
                    }`}
                  key={item.key}
                  onClick={() => {
                    onSelectItem(item);
                    close();
                  }}
                >
                  <span>{item.value}</span>
                  {selectedKey === item.key && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className='text-slate-600 dark:text-gray-400'
                    />
                  )}
                </button>
              ))}
              <div className='w-full h-2 bg-slate-100 dark:bg-gray-700'></div>
            </>
          )}

          {filteredList && filteredList.length > 0 ? (
            filteredList.map((item) => (
              <button
                className={`px-2 py-1 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-gray-900 gap-1 ${selectedKey === item.key ? "bg-slate-100 dark:bg-gray-700" : ""
                  }`}
                key={item.key}
                onClick={() => {
                  onSelectItem(item);
                  close();
                }}
              >
                {itemElement(item)}
                {selectedKey === item.key && (
                  <FontAwesomeIcon icon={faCheck} className='text-slate-600 dark:text-gray-400' />
                )}
              </button>
            ))
          ) : (
            <div className='px-2 py-1 font-medium'> No Results Found </div>
          )}
        </div>
      )}
    </FilterDropdown>
  );
};

export default FilterComboBox;
