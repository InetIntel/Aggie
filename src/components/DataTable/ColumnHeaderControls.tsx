import { useEffect, useState } from "react";
import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FilterDropdown from "../filters/FilterDropdown";

interface SearchProps {
  label: string;
  /** When set, the dropdown trigger is rendered as this header text itself. */
  headerLabel?: string;
  value: string;
  placeholder?: string;
  inputType?: "search" | "number";
  min?: number;
  step?: number;
  onChange: (value: string) => void;
}

interface SortProps {
  label: string;
  direction: "asc" | "desc" | null;
  /** Show separate up (ascending) and down (descending) buttons. */
  dual?: boolean;
  onChange: (direction: "asc" | "desc") => void;
}

interface Props {
  search?: SearchProps;
  sort?: SortProps;
  children?: React.ReactNode;
}

const ColumnHeaderControls = ({ search, sort, children }: Props) => {
  const [draft, setDraft] = useState(search?.value ?? "");

  useEffect(() => {
    setDraft(search?.value ?? "");
  }, [search?.value]);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {search && (
        <FilterDropdown
          label={search.headerLabel ?? `Search ${search.label}`}
          headerStyle={!!search.headerLabel}
          value={search.value || undefined}
          persistLabel
          onReset={() => search.onChange("")}
          panelClassName="w-64"
        >
          {({ close }) => (
            <form
              className="flex gap-2 p-2"
              onSubmit={(event) => {
                event.preventDefault();
                search.onChange(draft.trim());
                close();
              }}
            >
              <input
                autoFocus
                aria-label={`Search ${search.label}`}
                type={search.inputType ?? "search"}
                min={search.min}
                step={search.step}
                className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder={search.placeholder ?? `Search ${search.label.toLowerCase()}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                className="rounded bg-aggie-secondary-500 px-2 py-1 text-white hover:bg-aggie-secondary-600"
              >
                Search
              </button>
            </form>
          )}
        </FilterDropdown>
      )}
      {children}
      {sort && sort.dual && (
        <div className="flex items-center">
          {(["asc", "desc"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className={`rounded px-1 py-1 hover:bg-slate-200 dark:hover:bg-gray-600 ${
                sort.direction === dir
                  ? "text-aggie-secondary-700 dark:text-aggie-secondary-300"
                  : "text-slate-400 dark:text-gray-500"
              }`}
              title={`Sort ${sort.label} ${dir === "asc" ? "ascending" : "descending"}`}
              aria-label={`Sort ${sort.label} ${dir === "asc" ? "ascending" : "descending"}`}
              aria-pressed={sort.direction === dir}
              onClick={() => sort.onChange(dir)}
            >
              <FontAwesomeIcon icon={dir === "asc" ? faArrowUp : faArrowDown} />
            </button>
          ))}
        </div>
      )}
      {sort && !sort.dual && (
        <button
          type="button"
          className={`rounded p-1 hover:bg-slate-200 dark:hover:bg-gray-600 ${
            sort.direction ? "text-aggie-secondary-700 dark:text-aggie-secondary-300" : "text-slate-500 dark:text-gray-400"
          }`}
          title={
            sort.direction
              ? `Sorted ${sort.direction === "asc" ? "ascending" : "descending"} by ${sort.label}`
              : `Sort by ${sort.label}`
          }
          aria-label={
            sort.direction
              ? `Sorted ${sort.direction === "asc" ? "ascending" : "descending"} by ${sort.label}. Click to sort ${sort.direction === "asc" ? "descending" : "ascending"}.`
              : `Sort by ${sort.label} ascending`
          }
          onClick={() =>
            sort.onChange(sort.direction === "asc" ? "desc" : "asc")
          }
        >
          <FontAwesomeIcon
            icon={sort.direction === "desc" ? faArrowDown : faArrowUp}
          />
        </button>
      )}
    </div>
  );
};

export default ColumnHeaderControls;
