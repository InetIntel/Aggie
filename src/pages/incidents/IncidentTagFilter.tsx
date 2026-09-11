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
  onChange: (tagIds: string[]) => void;
}

const IncidentTagFilter = ({ selectedIds, onChange }: IProps) => {
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
      onReset={() => onChange([])}
      panelClassName='w-72'
      headerChild={
        <input
          type='search'
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Search tags'
          className='focus-theme py-1 px-2 border border-slate-200 rounded w-full'
        />
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
