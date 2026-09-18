import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { getTags } from "../../api/tags";
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  type TagCategory,
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
  const [category, setCategory] = useState<"all" | TagCategory>("all");
  const { data: tags, isLoading } = useQuery(["tags"], getTags, {
    staleTime: 40000,
  });

  const visibleTags = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (tags || [])
      .filter((tag) => category === "all" || tag.category === category)
      .filter((tag) =>
        !query || `${tag.name} ${tag.description || ""} ${TAG_CATEGORY_LABELS[tag.category]}`
          .toLowerCase()
          .includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [category, search, tags]);

  const visibleCategories = category === "all" ? TAG_CATEGORIES : [category];

  const toggleTag = (tagId: string) => {
    if (selectedIds.includes(tagId)) {
      onChange(selectedIds.filter((id) => id !== tagId));
      return;
    }
    onChange([...selectedIds, tagId]);
  };

  const resetFilter = () => {
    setSearch("");
    setCategory("all");
    onReset();
  };

  return (
    <FilterDropdown
      label='Tags'
      value={selectedIds.length ? `Tags: ${selectedIds.length}` : undefined}
      onReset={resetFilter}
      panelClassName='w-80'
      headerChild={
        <div className='space-y-2'>
          <input
            type='search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Search tags'
            className='focus-theme w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:bg-gray-800'
          />
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as "all" | TagCategory)
            }
            aria-label='Tag category'
            className='focus-theme w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:bg-gray-800'
          >
            <option value='all'>All categories ({tags?.length || 0})</option>
            {TAG_CATEGORIES.map((tagCategory) => (
              <option key={tagCategory} value={tagCategory}>
                {TAG_CATEGORY_LABELS[tagCategory]} ({
                  (tags || []).filter((tag) => tag.category === tagCategory).length
                })
              </option>
            ))}
          </select>
          <div className='grid grid-cols-2 gap-1'>
            <button
              type='button'
              aria-pressed={matchMode === "any"}
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
              aria-pressed={matchMode === "all"}
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
          <p className='px-1 text-xs text-slate-500 dark:text-gray-400'>
            {matchMode === "all"
              ? "Show incidents with every selected tag."
              : "Show incidents with at least one selected tag."}
          </p>
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
          {visibleCategories.map((tagCategory) => {
            const categoryTags = visibleTags.filter(
              (tag) => tag.category === tagCategory
            );
            if (!categoryTags.length) return null;

            return (
              <section key={tagCategory} className='border-b border-slate-200 last:border-0'>
                <h3 className='px-3 pt-2 text-xs font-medium text-slate-500 dark:text-gray-400'>
                  {TAG_CATEGORY_LABELS[tagCategory]}
                </h3>
                {categoryTags.map((tag) => {
                  const isSelected = selectedIds.includes(tag._id);
                  return (
                    <button
                      key={tag._id}
                      type='button'
                      aria-pressed={isSelected}
                      onClick={() => toggleTag(tag._id)}
                      title={tag.description}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                        isSelected
                          ? "bg-sky-50 dark:bg-gray-700"
                          : "hover:bg-slate-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        isSelected
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-slate-400"
                      }`}>
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
