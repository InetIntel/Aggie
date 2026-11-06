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
          <span>{value.length ? value.map(getCountryLabel).join(", ") : "Select countries"}</span>
          <FontAwesomeIcon icon={faChevronDown} />
        </Popover.Button>

        <Popover.Panel className='absolute z-20 mt-1 w-full min-w-[16rem] rounded border border-slate-300 bg-white dark:bg-gray-800 shadow-lg overflow-hidden'>
          {({ close }) => <>
          <div className='p-2 border-b border-slate-300'>
            <p className='font-medium mb-2'>Selected countries ({value.length})</p>
            {value.length ? (
              <div className='flex flex-wrap gap-1 max-h-28 overflow-y-auto'>
                {value.map((code) => (
                  <button
                    key={code}
                    type='button'
                    onClick={() => toggleCountry(code)}
                    aria-label={`Remove ${getCountryLabel(code)}`}
                    className='inline-flex items-center gap-2 px-2 py-1 rounded bg-slate-100 dark:bg-gray-700 border border-slate-300 hover:text-red-700'
                  >
                    {getCountryLabel(code)}
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                ))}
              </div>
            ) : <p className='text-slate-500'>No countries selected.</p>}
          </div>
          <div className='p-2 border-b border-slate-300'>
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search by country or code'
              aria-label='Search countries'
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
                  aria-pressed={selected.has(code)}
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
          <div className='p-2 border-t border-slate-300 flex justify-end'>
            <button
              type='button'
              onClick={() => { setSearch(""); close(); }}
              className='px-4 py-2 rounded bg-sky-700 text-white hover:bg-sky-800 font-medium'
            >
              Done
            </button>
          </div>
          </>}
        </Popover.Panel>
      </Popover>
    </div>
  );
};

export default CountryMultiSelect;
