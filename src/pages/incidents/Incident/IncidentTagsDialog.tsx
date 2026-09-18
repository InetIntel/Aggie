import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getTags } from "../../../api/tags";
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  Tag,
  type TagCategory,
} from "../../../api/tags/types";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";

interface IProps {
  isOpen: boolean;
  selectedTagIds: string[];
  isSaving: boolean;
  saveError: boolean;
  onClose: () => void;
  onSave: (tagIds: string[]) => void;
}

const IncidentTagsDialog = ({
  isOpen,
  selectedTagIds,
  isSaving,
  saveError,
  onClose,
  onSave,
}: IProps) => {
  const [selected, setSelected] = useState<string[]>(selectedTagIds);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | TagCategory>("all");
  const { data: tags, isLoading, isError } = useQuery(["tags"], getTags, {
    staleTime: 40000,
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelected(selectedTagIds);
    setSearch("");
    setCategory("all");
  }, [isOpen, selectedTagIds]);

  const visibleTags = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (tags || [])
      .filter((tag) => category === "all" || tag.category === category)
      .filter((tag) => {
        if (!query) return true;
        return `${tag.name} ${tag.description || ""} ${TAG_CATEGORY_LABELS[tag.category]}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [category, search, tags]);

  const visibleCategories = category === "all" ? TAG_CATEGORIES : [category];

  const categoryCount = (tagCategory: TagCategory) =>
    (tags || []).filter((tag) => tag.category === tagCategory).length;

  const toggleTag = (tag: Tag) => {
    setSelected((current) =>
      current.includes(tag._id)
        ? current.filter((id) => id !== tag._id)
        : [...current, tag._id]
    );
  };

  return (
    <AggieDialog
      isOpen={isOpen}
      onClose={onClose}
      className='p-4 max-w-2xl w-full'
      data={{
        title: "Incident tags",
        description: "Choose the tags that apply to this incident.",
      }}
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              category === "all"
                ? "border-slate-500 bg-slate-200 dark:bg-gray-600"
                : "border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-gray-700"
            }`}
          >
            All ({tags?.length || 0})
          </button>
          {TAG_CATEGORIES.map((tagCategory) => (
            <button
              key={tagCategory}
              type='button'
              aria-pressed={category === tagCategory}
              onClick={() => setCategory(tagCategory)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                category === tagCategory
                  ? "border-slate-500 bg-slate-200 dark:bg-gray-600"
                  : "border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-gray-700"
              }`}
            >
              {TAG_CATEGORY_LABELS[tagCategory]} ({categoryCount(tagCategory)})
            </button>
          ))}
        </div>

        <input
          type='search'
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Search tags'
          className='focus-theme px-3 py-2 border border-slate-300 rounded bg-slate-50 dark:bg-gray-900'
        />

        <div className='max-h-[55vh] overflow-y-auto pr-1'>
          {isLoading && <p className='text-sm'>Loading tags...</p>}
          {isError && (
            <p className='text-sm text-red-700'>Tags could not be loaded.</p>
          )}
          {!isLoading && !isError && visibleTags.length === 0 && (
            <p className='text-sm italic text-slate-500'>
              {search ? "No tags match your search." : "No tags have been created."}
            </p>
          )}

          {visibleCategories.map((tagCategory) => {
            const categoryTags = visibleTags.filter(
              (tag) => tag.category === tagCategory
            );
            if (!categoryTags.length) return null;

            return (
              <section key={tagCategory} className='mb-4 last:mb-0'>
                <h3 className='mb-2 font-medium'>
                  {TAG_CATEGORY_LABELS[tagCategory]}
                </h3>
                <div className='grid gap-2 sm:grid-cols-2'>
                  {categoryTags.map((tag) => {
                    const isSelected = selected.includes(tag._id);
                    return (
                      <label
                        key={tag._id}
                        className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 ${
                          isSelected
                            ? "border-sky-600 bg-sky-50 dark:bg-gray-700"
                            : "border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-gray-700"
                        }`}
                      >
                        <input
                          type='checkbox'
                          checked={isSelected}
                          onChange={() => toggleTag(tag)}
                          className='mt-1'
                        />
                        <span>
                          <span className='block'>{tag.name}</span>
                          {tag.description && (
                            <span className='block text-xs text-slate-500 dark:text-gray-400'>
                              {tag.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {saveError && (
          <p className='px-3 py-2 border border-red-400 bg-red-100 text-red-800'>
            The incident tags could not be saved.
          </p>
        )}

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-sm text-slate-500'>
            {selected.length} selected
          </p>
          <div className='flex gap-2'>
            <AggieButton
              type='button'
              variant='secondary'
              disabled={isSaving}
              onClick={onClose}
            >
              Cancel
            </AggieButton>
            <AggieButton
              type='button'
              variant='primary'
              loading={isSaving}
              disabled={isSaving || isLoading || isError}
              onClick={() => onSave(selected)}
            >
              Save tags
            </AggieButton>
          </div>
        </div>
      </div>
    </AggieDialog>
  );
};

export default IncidentTagsDialog;
