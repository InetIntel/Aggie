import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSession } from "../../../api/session";
import { deleteTag, getTags } from "../../../api/tags";

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

  const queryClient = useQueryClient();
  const { data, isSuccess, refetch } = useQuery(["tags"], getTags);
  const { data: session } = useQuery(["session"], getSession);

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
    <div className='my-3'>
      <div className='flex justify-between items-center mb-3'>
        <h3 className={"text-3xl font-medium"}>Tags</h3>

        {
          session?.role === "admin" &&
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
      <section className='divide-y divide-slate-300 bg-white dark:bg-gray-800 rounded-lg border border-slate-300'>
        {data &&
          data.map((tag) => (
            <article key={tag._id} className='py-2 px-3 grid grid-cols-5'>
              <header className='col-span-2'>
                <h2 className='text-lg font-medium'>{tag.name}</h2>
                <p className='text-sm'>
                  <span className='italic'>created by </span>
                  <UserToken id={tag.user?._id || ""} loading={!data} />
                  <span className='italic'> on </span>
                  <span>
                    <DateTime dateString={tag.storedAt} />
                  </span>
                </p>
              </header>
              <main className='col-span-2 text-sm'>{tag.description}</main>
              <footer className='flex justify-end items-center'>
                { session?.role === "admin" &&
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
                      onClick={() => setDeleteOpen(tag._id)}
                    >
                      <FontAwesomeIcon icon={faTrashAlt} />
                      Permanently Delete
                    </AggieButton>
                  </DropdownMenu>
                }
              </footer>
            </article>
          ))}
      </section>
      { session?.role === "admin" && <>
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
          title={`Delete Tag ${tagfromId(deleteOpen)?.name} Permanently?`}
          description={"Are you sure you want to do this?"}
          confirmText={"Delete"}
          className='text-center'
          onClose={() => setDeleteOpen("")}
          onConfirm={() => onDeleteTag(deleteOpen)}
        ></ConfirmationDialog>
      </> }
    </div>
  );
};

export default TagsIndex;
