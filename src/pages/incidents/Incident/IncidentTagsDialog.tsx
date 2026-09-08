import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getTags } from "../../../api/tags";
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  Tag,
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
  const { data: tags, isLoading, isError } = useQuery(["tags"], getTags, {
    staleTime: 40000,
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelected(selectedTagIds);
    setSearch("");
  }, [isOpen, selectedTagIds]);

  const visibleTags = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (tags || [])
      .filter((tag) => {
        if (!query) return true;
        return `${tag.name} ${tag.description || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, tags]);

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
      className='p-4 max-w-xl w-full'
      data={{
        title: "Incident tags",
        description: "Choose the tags that apply to this incident.",
      }}
    >
      <div className='flex flex-col gap-4'>
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

          {TAG_CATEGORIES.map((category) => {
            const categoryTags = visibleTags.filter(
              (tag) => (tag.category || "general") === category
            );
            if (!categoryTags.length) return null;

            return (
              <section key={category} className='mb-4 last:mb-0'>
                <h3 className='font-medium mb-2'>
                  {TAG_CATEGORY_LABELS[category]}
                </h3>
                <div className='grid gap-2 sm:grid-cols-2'>
                  {categoryTags.map((tag) => (
                    <label
                      key={tag._id}
                      className='flex items-center gap-2 rounded border border-slate-300 px-3 py-2 cursor-pointer hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-gray-700'
                      title={tag.description}
                    >
                      <input
                        type='checkbox'
                        checked={selected.includes(tag._id)}
                        onChange={() => toggleTag(tag)}
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
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

        <div className='flex justify-between items-center'>
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
