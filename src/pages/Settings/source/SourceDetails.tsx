import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteSource, editSource, getSource } from "../../../api/sources";
import { getSession } from "../../../api/session";
import type { SourceEvent } from "../../../api/session/types";

import AggieSwitch from "../../../components/AggieSwitch";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import CreateEditSourceForm from "./CreateEditSourceForm";

import {
  faEdit,
  faEllipsisH,
  faKey,
  faSpinner,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const SourceDetails = () => {
  let { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data } = useQuery(["source", id], () => getSource(id));
  const { data: session } = useQuery(["session"], getSession);
  const doEditSource = useMutation(editSource, {
    onSuccess: () => {
      queryClient.invalidateQueries(["source", id]);
    },
  });
  const [deletionModal, setDeletionModal] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const doDeleteSource = useMutation(deleteSource, {
    onSuccess: () => {
      setDeletionModal(false);
      queryClient.invalidateQueries(["source", id]);
    },
  });

  const isLoading = doEditSource.isLoading || !data;

  return (
    <div className=''>
      <div className='flex justify-between items-center my-3'>
        <h2 className='text-3xl font-medium'>{data?.nickname}</h2>
        {session?.role === "admin" && (
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
                  label='Enable Source'
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
                onClick={() => setOpenCreate(true)}
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
          <p className='text-slate-600 dark:text-gray-400'>Media Source</p>
          <div className='col-span-3'>
            <span className='rounded px-2 py-1 bg-slate-300 dark:bg-gray-500 font-medium'>
              {data?.media}
            </span>
          </div>
        </div>

        { session?.role === "admin" &&
          <div className='grid grid-cols-4'>
            <p className='text-slate-600 dark:text-gray-400'>Credential</p>
            <div className='col-span-3'>
              <p className=' bg-slate-200 dark:bg-gray-600 rounded-full px-2  w-fit  py-1'>
                <Link
                  to={`/settings/credentials`}
                  className='hover:underline flex items-center gap-2'
                  title='API Key Credential'
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
        }
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
          data?.events?.map((event: SourceEvent) => {
            return (
              <div className='grid grid-cols-4'>
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
      <ConfirmationDialog
        isOpen={deletionModal}
        variant='danger'
        disabled={doDeleteSource.isLoading}
        className='w-full max-w-lg text-center'
        title={`Delete: ${data?.nickname}?`}
        confirmText={"Delete"}
        onClose={() => setDeletionModal(false)}
        onConfirm={() => !!data && doDeleteSource.mutate(data)}
      ></ConfirmationDialog>
      <AggieDialog
        isOpen={!!openCreate}
        onClose={() => setOpenCreate(false)}
        data={{ title: "Create New Source" }}
        className='p-3 w-full max-w-lg'
      >
        <CreateEditSourceForm
          source={data}
          onClose={() => setOpenCreate(false)}
        />
      </AggieDialog>
    </div>
  );
};

export default SourceDetails;
