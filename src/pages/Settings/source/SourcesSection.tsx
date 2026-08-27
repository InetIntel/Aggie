import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSession } from "../../../api/session";
import { deleteSource, editSource, getSources } from "../../../api/sources";
import type { Source } from "../../../api/sources/types";

import AxiosErrorCard from "../../../components/AxiosErrorCard";
import { Link } from "react-router-dom";
import AggieSwitch from "../../../components/AggieSwitch";
import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import CreateEditSourceForm from "./CreateEditSourceForm";
import SourceDetailsView from "./SourceDetailsView";
import Configuration from "../Configuration";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEdit,
  faEllipsisH,
  faExclamationTriangle,
  faKey,
  faPlusCircle,
  faSpinner,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";

// Sources list + create/edit/delete, extracted so it can render both on its own
// page (`SourcesIndex`) and inside the consolidated Connections page.
const SourcesSection = () => {
  const queryClient = useQueryClient();
  const { data, isError, error } = useQuery(["sources"], getSources);
  const { data: session } = useQuery(["session"], getSession);

  const [deletionModal, setDeletionModal] = useState<Source>();
  const [openCreate, setOpenCreate] = useState("");
  const [detailsId, setDetailsId] = useState("");
  const [detailsEditing, setDetailsEditing] = useState(false);

  const isManager =
    session?.permissions?.includes("manage sources") === true;

  const doDeleteSource = useMutation(deleteSource, {
    onSuccess: () => {
      setDeletionModal(undefined);
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const doEnableSource = useMutation(editSource, {
    onSuccess: () => {
      queryClient.invalidateQueries(["sources"]);
    },
  });

  function getSourceFromId(id: string) {
    if (id === "new") return undefined;
    return data?.find((i) => i._id === id);
  }

  // View or edit a source, both shown in the same details popup so the edit
  // experience is identical whether reached by clicking the source or "Edit".
  const openDetails = (sourceId: string, editing = false) => {
    setDetailsEditing(editing);
    setDetailsId(sourceId);
  };
  const closeDetails = () => {
    setDetailsId("");
    setDetailsEditing(false);
  };

  if (isError)
    return (
      <div className='mt-4'>
        <AxiosErrorCard error={error} />
      </div>
    );

  return (
    <div>
      <div className='flex justify-between items-center'>
        <h1 className='font-medium my-3 text-3xl'>Providers and Feeds</h1>
        {isManager && (
          <AggieButton
            onClick={() => setOpenCreate("new")}
            variant='primary'
            padding='px-3 py-2'
            icon={faPlusCircle}
          >
            Add feed
          </AggieButton>
        )}
      </div>
      {isManager && <Configuration />}
      <section className='bg-white dark:bg-gray-800 rounded-lg border border-slate-300 divide-y divide-slate-300 mt-3'>
        {data &&
          data.map((source) => (
            <article
              key={source._id}
              className='grid grid-cols-6 py-3 px-3 text-slate-600 dark:text-gray-400 items-center text-xs font-medium'
            >
              <main className='col-span-3'>
                <button
                  type='button'
                  onClick={() => openDetails(source._id)}
                  className='hover:underline text-left'
                >
                  <h2 className='font-medium text-blue-600 text-lg'>
                    {source.nickname}
                  </h2>
                </button>

                <p className='text-sm '>{source.keywords}</p>
              </main>
              {isManager && (
                <div>
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
                      {source.credentials.name}
                    </Link>
                  </p>
                </div>
              )}
              <div>
                {source.distinctErrorCount > 0 && (
                  <p className='flex items-center gap-2 bg-orange-100 rounded-full px-2  w-fit py-1'>
                    <button
                      type='button'
                      onClick={() => openDetails(source._id)}
                      className='hover:underline text-orange-800 flex items-center gap-2'
                      title='Errors while fetching this feed'
                    >
                      <FontAwesomeIcon
                        icon={faExclamationTriangle}
                        size='xs'
                        className='text-orange-600'
                      />
                      {source.distinctErrorCount}{" "}
                      {source.distinctErrorCount === 1 ? "Warning" : "Warnings"}
                    </button>
                  </p>
                )}
              </div>
              {isManager && (
                <div className='flex justify-end items-center gap-2'>
                  <p className='text-xs font-medium text-slate-600 dark:text-gray-400'>
                    {source.enabled ? "Enabled" : "Disabled"}
                  </p>
                  <div className='flex items-center gap-1'>
                    {doEnableSource.isLoading && (
                      <FontAwesomeIcon
                        icon={faSpinner}
                        className={"animate-spin"}
                      />
                    )}
                    <AggieSwitch
                      checked={source.enabled}
                      onChange={() => {
                        doEnableSource.mutate({
                          ...source,
                          enabled: !source.enabled,
                        });
                      }}
                      label='Enable Feed'
                      disabled={doEnableSource.isLoading}
                    />
                  </div>

                  <DropdownMenu
                    className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-400'
                    panelClassName='bg-white dark:bg-gray-800 border border-slate-300 rounded-lg overflow-hidden right-0 text-sm'
                    buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
                  >
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full'
                      onClick={() => openDetails(source._id, true)}
                    >
                      <FontAwesomeIcon icon={faEdit} />
                      Edit
                    </AggieButton>
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-red-600'
                      onClick={() => setDeletionModal(source)}
                    >
                      <FontAwesomeIcon icon={faTrashAlt} />
                      Permanently Delete
                    </AggieButton>
                  </DropdownMenu>
                </div>
              )}
            </article>
          ))}
      </section>
      {isManager && (
        <>
          <ConfirmationDialog
            isOpen={!!deletionModal}
            variant='danger'
            disabled={doDeleteSource.isLoading}
            className='w-full max-w-lg text-center'
            title={`Delete feed: ${
              data?.find((c) => c._id === deletionModal?._id)?.nickname
            }?`}
            confirmText={"Delete"}
            onClose={() => setDeletionModal(undefined)}
            onConfirm={() =>
              !!deletionModal && doDeleteSource.mutate(deletionModal)
            }
          ></ConfirmationDialog>
          <AggieDialog
            isOpen={!!openCreate}
            onClose={() => setOpenCreate("")}
            data={{ title: openCreate === "new" ? "Add feed" : "Edit feed" }}
            className='p-3 w-full max-w-lg'
          >
            <CreateEditSourceForm
              source={getSourceFromId(openCreate)}
              onClose={() => setOpenCreate("")}
            />
          </AggieDialog>
        </>
      )}
      <AggieDialog
        isOpen={!!detailsId}
        onClose={closeDetails}
        className='p-3 w-full max-w-lg'
      >
        <SourceDetailsView
          id={detailsId}
          onClose={closeDetails}
          initialEditing={detailsEditing}
        />
      </AggieDialog>
    </div>
  );
};

export default SourcesSection;
