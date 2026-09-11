import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { getTags } from "../../api/tags";
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
} from "../../api/tags/types";
import FilterDropdown from "../../components/filters/FilterDropdown";

interface IProps {
  selectedIds: string[];
  matchMode: "any" | "all";
  onChange: (tagIds: string[]) => void;
  onMatchModeChange: (mode: "any" | "all") => void;
  onReset: () => void;
}

const IncidentTagFilter = ({
  selectedIds,
  matchMode,
  onChange,
  onMatchModeChange,
  onReset,
}: IProps) => {
  const [search, setSearch] = useState("");
  const { data: tags, isLoading } = useQuery(["tags"], getTags, {
    staleTime: 40000,
  });

  const visibleTags = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (tags || [])
      .filter((tag) =>
        !query || `${tag.name} ${tag.description || ""}`
          .toLowerCase()
          .includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, tags]);

  const toggleTag = (tagId: string) => {
    if (selectedIds.includes(tagId)) {
      onChange(selectedIds.filter((id) => id !== tagId));
      return;
    }
    onChange([...selectedIds, tagId]);
  };

  return (
    <FilterDropdown
      label='Tags'
      value={selectedIds.length ? `Tags: ${selectedIds.length}` : undefined}
      onReset={onReset}
      panelClassName='w-72'
      headerChild={
        <div>
          <input
            type='search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Search tags'
            className='focus-theme py-1 px-2 border border-slate-200 rounded w-full'
          />
          <div className='grid grid-cols-2 gap-1 mt-2'>
            <button
              type='button'
              onClick={() => onMatchModeChange("any")}
              className={`px-2 py-1 rounded border ${
                matchMode === "any"
                  ? "bg-slate-200 dark:bg-gray-600 border-slate-400"
                  : "border-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700"
              }`}
            >
              Match any
            </button>
            <button
              type='button'
              onClick={() => onMatchModeChange("all")}
              className={`px-2 py-1 rounded border ${
                matchMode === "all"
                  ? "bg-slate-200 dark:bg-gray-600 border-slate-400"
                  : "border-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700"
              }`}
            >
              Match all
            </button>
          </div>
        </div>
      }
    >
      {() => (
        <div className='max-h-80 overflow-y-auto bg-white dark:bg-gray-800'>
          {isLoading && <p className='px-3 py-2'>Loading tags...</p>}
          {!isLoading && visibleTags.length === 0 && (
            <p className='px-3 py-2 italic text-slate-500'>
              {search ? "No tags match your search." : "No tags available."}
            </p>
          )}
          {TAG_CATEGORIES.map((category) => {
            const categoryTags = visibleTags.filter(
              (tag) => (tag.category || "general") === category
            );
            if (!categoryTags.length) return null;

            return (
              <section key={category} className='border-b border-slate-200 last:border-0'>
                <h3 className='px-3 pt-2 text-xs font-medium text-slate-500 dark:text-gray-400'>
                  {TAG_CATEGORY_LABELS[category]}
                </h3>
                {categoryTags.map((tag) => {
                  const isSelected = selectedIds.includes(tag._id);
                  return (
                    <button
                      key={tag._id}
                      type='button'
                      onClick={() => toggleTag(tag._id)}
                      className='px-3 py-2 w-full flex items-center gap-2 text-left hover:bg-slate-100 dark:hover:bg-gray-700'
                    >
                      <span className='w-4 h-4 border border-slate-400 rounded grid place-items-center shrink-0'>
                        {isSelected && (
                          <FontAwesomeIcon icon={faCheck} className='text-xs' />
                        )}
                      </span>
                      <span>{tag.name}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </FilterDropdown>
  );
};

export default IncidentTagFilter;
