import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteSource, editSource, getSource } from "../../../api/sources";
import { getSession } from "../../../api/session";
import type { SourceEvent } from "../../../api/session/types";
import { providerLabel } from "../../../api/common";

import AggieSwitch from "../../../components/AggieSwitch";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import CreateEditSourceForm from "./CreateEditSourceForm";

import {
  faEdit,
  faEllipsisH,
  faKey,
  faSpinner,
  faTrashAlt,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps {
  id?: string;
  // When provided (i.e. rendered in a popup), a close "X" is shown and this is
  // called to dismiss the popup (also after the source is deleted).
  onClose?: () => void;
  // Open straight into the edit form (used when "Edit" is chosen from the list),
  // so editing looks the same whether reached from the list or from the details.
  initialEditing?: boolean;
}

// Shared source-details content used by both the standalone page and the popup
// opened from the sources list.
const SourceDetailsView = ({ id, onClose, initialEditing = false }: IProps) => {
  const queryClient = useQueryClient();
  const { data } = useQuery(["source", id], () => getSource(id), {
    enabled: !!id,
  });
  const { data: session } = useQuery(["session"], getSession);
  const doEditSource = useMutation(editSource, {
    onSuccess: () => {
      queryClient.invalidateQueries(["source", id]);
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const [deletionModal, setDeletionModal] = useState(false);
  const [editing, setEditing] = useState(initialEditing);
  const doDeleteSource = useMutation(deleteSource, {
    onSuccess: () => {
      setDeletionModal(false);
      queryClient.invalidateQueries(["sources"]);
      onClose?.();
    },
  });

  const isManager =
    session?.role === "admin" || session?.role === "team_lead";
  const isLoading = doEditSource.isLoading || !data;

  return (
    <div>
      {onClose && (
        <div className='flex justify-end'>
          <AggieButton
            onClick={onClose}
            className='px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-gray-400'
            aria-label='Close'
          >
            <FontAwesomeIcon icon={faXmark} />
          </AggieButton>
        </div>
      )}

      {editing ? (
        <div className='flex flex-col'>
          <h2 className='text-3xl font-medium my-3'>Edit feed</h2>
          <CreateEditSourceForm
            source={data}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className='flex justify-between items-center my-3 gap-4'>
            <h2 className='text-3xl font-medium'>{data?.nickname}</h2>
            {isManager && (
              <div className='flex gap-4'>
                <PlaceholderDiv
                  className='flex justify-end items-center gap-2'
                  loading={!data}
                >
                  <p className='text-xs font-medium text-slate-600 dark:text-gray-400'>
                    {data?.enabled ? "Enabled" : "Disabled"}
                  </p>
                  <div className='flex items-center gap-1'>
                    {doEditSource.isLoading && (
                      <FontAwesomeIcon
                        icon={faSpinner}
                        className={"animate-spin"}
                      />
                    )}
                    <AggieSwitch
                      checked={data?.enabled || false}
                      onChange={() => {
                        doEditSource.mutate({
                          ...data,
                          enabled: !data?.enabled,
                        });
                      }}
                      label='Enable Feed'
                      disabled={isLoading}
                    />
                  </div>
                </PlaceholderDiv>
                <DropdownMenu
                  variant='secondary'
                  className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 border border-slate-300'
                  panelClassName='overflow-hidden right-0 text-sm'
                  buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
                >
                  <AggieButton
                    className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full'
                    onClick={() => setEditing(true)}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                    Edit
                  </AggieButton>
                  <AggieButton
                    className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-red-600'
                    onClick={() => setDeletionModal(true)}
                  >
                    <FontAwesomeIcon icon={faTrashAlt} />
                    Permanently Delete
                  </AggieButton>
                </DropdownMenu>
              </div>
            )}
          </div>
          <section className='bg-white dark:bg-gray-800 rounded-lg px-3 py-3 flex flex-col gap-2'>
            <div className='grid grid-cols-4 '>
              <p className='text-slate-600 dark:text-gray-400'>Provider</p>
              <div className='col-span-3'>
                <span className='rounded px-2 py-1 bg-slate-300 dark:bg-gray-500 font-medium'>
                  {providerLabel(data?.media)}
                </span>
              </div>
            </div>

            {isManager && (
              <div className='grid grid-cols-4'>
                <p className='text-slate-600 dark:text-gray-400'>Connection</p>
                <div className='col-span-3'>
                  <p className=' bg-slate-200 dark:bg-gray-600 rounded-full px-2  w-fit  py-1'>
                    <Link
                      to={`/settings/connections`}
                      className='hover:underline flex items-center gap-2'
                      title='Connection'
                    >
                      <FontAwesomeIcon
                        icon={faKey}
                        size='xs'
                        className='text-slate-500 dark:text-gray-400'
                      />
                      {data?.credentials.name}
                    </Link>
                  </p>
                </div>
              </div>
            )}
            <div className='grid grid-cols-4'>
              <p className='text-slate-600 dark:text-gray-400'>Created by</p>
              <div className='col-span-3'>
                <Link
                  to={`/settings/user/${data?.user._id}`}
                  className='hover:underline text-blue-600 '
                >
                  {data?.user.username}
                </Link>
              </div>
            </div>
            <div className='grid grid-cols-4'>
              <p className='text-slate-600 dark:text-gray-400'>Tags</p>
              <div className='col-span-3'>{data?.tags}</div>
            </div>
          </section>
          <section className='bg-white dark:bg-gray-800 rounded-lg px-3 py-3 mt-3 flex flex-col gap-2'>
            <header className='grid grid-cols-4 border-slate-300 border-b'>
              <p>Time</p>
              <p>Level</p>
              <p>Message</p>
            </header>
            {data?.events ? (
              data?.events?.map((event: SourceEvent, index: number) => {
                return (
                  <div className='grid grid-cols-4' key={index}>
                    <p>{event.datetime}</p>
                    <p>{event.type}</p>
                    <p className='col-span-2'>{event.message}</p>
                  </div>
                );
              })
            ) : (
              <p>No Events Found</p>
            )}
          </section>
          {isManager && data && (
            <section className='bg-white dark:bg-gray-800 rounded-lg px-3 py-3 mt-3 flex flex-col gap-2'>
              <h3 className='text-xl font-medium'>Edit feed</h3>
              <CreateEditSourceForm
                source={data}
                onClose={onClose ?? (() => setEditing(false))}
              />
            </section>
          )}
        </>
      )}

      <ConfirmationDialog
        isOpen={deletionModal}
        variant='danger'
        disabled={doDeleteSource.isLoading}
        className='w-full max-w-lg text-center'
        title={`Delete feed: ${data?.nickname}?`}
        confirmText={"Delete"}
        onClose={() => setDeletionModal(false)}
        onConfirm={() => !!data && doDeleteSource.mutate(data)}
      ></ConfirmationDialog>
    </div>
  );
};

export default SourceDetailsView;
