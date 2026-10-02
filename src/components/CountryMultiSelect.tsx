import { Popover } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useMemo, useState } from "react";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

const countryOptions = Object.entries(countries.getNames("en"))
  .map(([code, name]) => ({ code, name }))
  .sort((first, second) => first.name.localeCompare(second.name));

export const getCountryLabel = (code: string) => {
  const name = countries.getName(code, "en");
  return name ? `${name} (${code})` : code;
};

interface IProps {
  label?: string;
  value: string[];
  onChange: (countryCodes: string[]) => void;
}

const CountryMultiSelect = ({ label = "Countries", value, onChange }: IProps) => {
  const [search, setSearch] = useState("");
  const selected = new Set(value);
  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return countryOptions;

    return countryOptions.filter(({ code, name }) => (
      code.toLowerCase().includes(query) || name.toLowerCase().includes(query)
    ));
  }, [search]);

  const toggleCountry = (code: string) => {
    if (selected.has(code)) {
      onChange(value.filter((countryCode) => countryCode !== code));
      return;
    }

    onChange([...value, code].sort());
  };

  return (
    <div className='flex flex-col gap-1 text-sm'>
      <span className='font-medium'>{label}</span>
      <Popover className='relative'>
        <Popover.Button className='w-full px-3 py-2 rounded border border-slate-300 bg-white dark:bg-gray-900 flex items-center justify-between text-left'>
          <span>{value.length ? `${value.length} selected` : "Select countries"}</span>
          <FontAwesomeIcon icon={faChevronDown} />
        </Popover.Button>

        <Popover.Panel className='absolute z-20 mt-1 w-full min-w-[16rem] rounded border border-slate-300 bg-white dark:bg-gray-800 shadow-lg overflow-hidden'>
          <div className='p-2 border-b border-slate-300'>
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search by country or code'
              className='w-full px-3 py-2 rounded border border-slate-300 bg-white dark:bg-gray-900'
            />
          </div>
          <div className='max-h-64 overflow-y-auto'>
            {filteredCountries.length ? (
              filteredCountries.map(({ code, name }) => (
                <button
                  key={code}
                  type='button'
                  onClick={() => toggleCountry(code)}
                  className='w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-100 dark:hover:bg-gray-700'
                >
                  <span>{name} ({code})</span>
                  {selected.has(code) && <FontAwesomeIcon icon={faCheck} />}
                </button>
              ))
            ) : (
              <p className='px-3 py-4 text-slate-600 dark:text-gray-300'>No countries found.</p>
            )}
          </div>
        </Popover.Panel>
      </Popover>

      {value.length > 0 && (
        <div className='flex flex-wrap gap-1 mt-1'>
          {value.map((code) => (
            <span
              key={code}
              className='inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-gray-700 border border-slate-300'
            >
              {getCountryLabel(code)}
              <button
                type='button'
                onClick={() => toggleCountry(code)}
                aria-label={`Remove ${getCountryLabel(code)}`}
                className='rounded hover:text-red-700'
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default CountryMultiSelect;
