import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSession } from "../../../api/session";
import { deleteTag, getTags } from "../../../api/tags";
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  type TagCategory,
} from "../../../api/tags/types";

import AggieButton from "../../../components/AggieButton";
import UserToken from "../../../components/UserToken";
import DropdownMenu from "../../../components/DropdownMenu";
import AggieDialog from "../../../components/AggieDialog";
import CreateEditTagForm from "./CreateEditTagForm";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEdit,
  faEllipsisH,
  faPlusCircle,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import DateTime from "../../../components/DateTime";

interface IProps {}

const TagsIndex = (props: IProps) => {
  const [editOpen, setEditOpen] = useState("");
  const [deleteOpen, setDeleteOpen] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | TagCategory>("all");

  const queryClient = useQueryClient();
  const { data, isSuccess } = useQuery(["tags"], getTags);
  const { data: session } = useQuery(["session"], getSession);
  const canEditTags = session?.permissions?.includes("edit tags") === true;

  const visibleTags = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data || [])
      .filter((tag) => category === "all" || tag.category === category)
      .filter((tag) => {
        if (!query) return true;
        return `${tag.name} ${tag.description || ""} ${TAG_CATEGORY_LABELS[tag.category]}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [category, data, search]);

  const categoryCount = (tagCategory: TagCategory) =>
    (data || []).filter((tag) => tag.category === tagCategory).length;

  const visibleCategories = category === "all" ? TAG_CATEGORIES : [category];

  const doDeleteTag = useMutation(deleteTag, {
    onSuccess: () => {
      queryClient.invalidateQueries(["tags"]);
      setDeleteOpen("");
    },
  });

  function tagfromId(id: string) {
    if (id === "newTag") return undefined;
    return data?.find((i) => i._id === id);
  }

  function onDeleteTag(id: string) {
    const tag = tagfromId(id);
    !!tag && doDeleteTag.mutate(tag);
  }

  return (
    <div className='my-3 mb-16'>
      <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className={"text-3xl font-medium"}>Tags</h3>
          <p className='text-sm text-slate-500 dark:text-gray-400'>
            Organize the tags available for incidents.
          </p>
        </div>

        {
          canEditTags &&
          <AggieButton
            variant='primary'
            padding='px-3 py-2'
            icon={faPlusCircle}
            onClick={() => setEditOpen("newTag")}
          >
            Create New Tag
          </AggieButton>
        }
      </div>
      <div className='mb-3 flex flex-wrap gap-2'>
        <button
          type='button'
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            category === "all"
              ? "border-slate-500 bg-slate-200 dark:bg-gray-600"
              : "border-slate-300 bg-white hover:bg-slate-100 dark:bg-gray-800 dark:hover:bg-gray-700"
          }`}
        >
          All ({data?.length || 0})
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
                : "border-slate-300 bg-white hover:bg-slate-100 dark:bg-gray-800 dark:hover:bg-gray-700"
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
        className='focus-theme mb-4 px-3 py-2 border border-slate-300 rounded w-full bg-white dark:bg-gray-800'
      />

      {isSuccess && visibleTags.length === 0 && (
        <p className='rounded-lg border border-slate-300 bg-white px-3 py-4 italic text-slate-500 dark:bg-gray-800'>
          {search
            ? "No tags match your search."
            : category === "all"
              ? "No tags have been created."
              : "No tags have been created in this category."}
        </p>
      )}

      <div className='flex flex-col gap-4'>
        {visibleCategories.map((tagCategory) => {
          const categoryTags = visibleTags.filter(
            (tag) => tag.category === tagCategory
          );
          if (!categoryTags.length) return null;

          return (
            <section key={tagCategory}>
              <div className='mb-2 flex items-baseline gap-2'>
                <h2 className='text-xl font-medium'>
                  {TAG_CATEGORY_LABELS[tagCategory]}
                </h2>
                <span className='text-sm text-slate-500'>
                  {categoryTags.length} {categoryTags.length === 1 ? "tag" : "tags"}
                </span>
              </div>
              <div className='divide-y divide-slate-300 rounded-lg border border-slate-300 bg-white dark:bg-gray-800'>
                {categoryTags.map((tag) => (
                  <article
                    key={tag._id}
                    className='grid gap-2 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-center'
                  >
                    <header>
                      <h3 className='text-lg font-medium'>{tag.name}</h3>
                      <p className='text-xs text-slate-500 dark:text-gray-400'>
                        Created by <UserToken id={tag.user?._id || ""} loading={!data} /> on{" "}
                        <DateTime dateString={tag.storedAt} />
                      </p>
                    </header>
                    <p className='text-sm text-slate-600 dark:text-gray-300'>
                      {tag.description || "No description"}
                    </p>
                    <footer className='flex justify-end'>
                      {canEditTags && (
                        <DropdownMenu
                          variant='secondary'
                          className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 border border-slate-300'
                          panelClassName='overflow-hidden right-0 text-sm'
                          buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
                        >
                          <AggieButton
                            className='px-3 py-2 hover:bg-slate-100 text-slate-600 dark:text-gray-400 w-full'
                            onClick={() => setEditOpen(tag._id)}
                          >
                            <FontAwesomeIcon icon={faEdit} />
                            Edit
                          </AggieButton>
                          <AggieButton
                            className='px-3 py-2 hover:bg-slate-100 text-red-600'
                            onClick={() => {
                              doDeleteTag.reset();
                              setDeleteOpen(tag._id);
                            }}
                          >
                            <FontAwesomeIcon icon={faTrashAlt} />
                            Permanently Delete
                          </AggieButton>
                        </DropdownMenu>
                      )}
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {canEditTags && <>
        <AggieDialog
          isOpen={!!editOpen}
          onClose={() => setEditOpen("")}
          className='px-3 py-4 w-full max-w-lg'
          data={{
            title: editOpen === "newTag" ? "Create New Tag" : "Edit Tag",
          }}
        >
          <CreateEditTagForm
            tag={tagfromId(editOpen)}
            onClose={() => setEditOpen("")}
          />
        </AggieDialog>
        <ConfirmationDialog
          isOpen={!!deleteOpen}
          variant='danger'
          disabled={doDeleteTag.isLoading}
          loading={doDeleteTag.isLoading}
          title={`Delete Tag ${tagfromId(deleteOpen)?.name} Permanently?`}
          description={"Are you sure you want to do this?"}
          confirmText={"Delete"}
          className='text-center'
          onClose={() => setDeleteOpen("")}
          onConfirm={() => onDeleteTag(deleteOpen)}
        >
          {doDeleteTag.isError && (
            <p className='mx-3 mb-3 rounded border border-red-400 bg-red-100 px-3 py-2 text-red-800'>
              The tag could not be deleted.
            </p>
          )}
        </ConfirmationDialog>
      </> }
    </div>
  );
};

export default TagsIndex;
