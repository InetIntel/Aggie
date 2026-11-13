import { useMemo, useState } from "react";
import FilterDropdown from "../filters/FilterDropdown";

export interface HeaderListOption {
  /** Value reported to `onSelect` when the option is clicked. */
  value: string;
  label: string;
}

interface Props {
  /** Column header text; it is also the dropdown trigger. */
  label: string;
  searchPlaceholder: string;
  options: HeaderListOption[];
  /** Currently applied filter value (an option value or free text). */
  value: string;
  /** Text shown in the trigger tooltip/highlight for the applied value. */
  displayValue?: string;
  loading?: boolean;
  onSelect: (value: string) => void;
}

/**
 * Column-header filter: the header text opens a panel with a search box on top
 * and the full list of values underneath. Typing narrows the list; clicking a
 * value applies it, and pressing Enter applies the typed text as a free search.
 */
const HeaderListFilter = ({
  label,
  searchPlaceholder,
  options,
  value,
  displayValue,
  loading,
  onSelect,
}: Props) => {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <FilterDropdown
      label={label}
      headerStyle
      value={value ? displayValue ?? value : undefined}
      onReset={() => onSelect("")}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      panelClassName="w-72 max-w-[calc(100vw-2rem)]"
    >
      {({ close }) => (
        <div className="flex flex-col">
          <form
            className="p-2 border-b border-slate-300 dark:border-gray-600"
            onSubmit={(event) => {
              event.preventDefault();
              if (!query.trim()) return;
              onSelect(query.trim());
              close();
            }}
          >
            <input
              autoFocus
              type="search"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {loading && (
              <li className="px-3 py-1 text-slate-500 dark:text-gray-400">
                Loading…
              </li>
            )}
            {!loading && visible.length === 0 && (
              <li className="px-3 py-1 text-slate-500 dark:text-gray-400">
                No matches. Press Enter to search for “{query.trim()}”.
              </li>
            )}
            {visible.map((option) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  className={`block w-full px-3 py-1 text-left hover:bg-slate-200 dark:hover:bg-gray-600 ${
                    option.value === value
                      ? "bg-slate-200 font-semibold dark:bg-gray-600"
                      : ""
                  }`}
                  onClick={() => {
                    onSelect(option.value);
                    close();
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FilterDropdown>
  );
};

export default HeaderListFilter;
