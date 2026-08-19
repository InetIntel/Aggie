import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import { deleteSource, editSource, getSource } from "../../../api/sources";
import type { Source } from "../../../api/sources/types";
import { deleteCredential } from "../../../api/credentials";
import type { Credential } from "../../../api/credentials/types";
import {
  providerLabel,
  ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER,
  type CredentialOption,
} from "../../../api/common";

import AggieSwitch from "../../../components/AggieSwitch";
import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import CreateEditSourceForm from "../source/CreateEditSourceForm";
import SourceDetailsView from "../source/SourceDetailsView";
import CreateCredentialForm from "../Credentials/CreateCredentialForm";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEdit,
  faEllipsisH,
  faExclamationTriangle,
  faEye,
  faKey,
  faPlusCircle,
  faSpinner,
  faTrash,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";

interface IProps {
  type: CredentialOption;
  sources: Source[];
  credentials: Credential[];
  isManager: boolean;
}

// One card per provider on the Feeds page. Co-locates that provider's
// connections ("Connect {provider}") and its feeds ("Add feed"), reusing the
// same dialogs/mutations the standalone sections use.
const ApiTypeSection = ({ type, sources, credentials, isManager }: IProps) => {
  const queryClient = useQueryClient();
  const label = providerLabel(type);

  const typeSources = sources.filter((source) => source.media === type);
  const typeCredentials = credentials.filter((cred) => cred.type === type);

  // Capped at one connection per provider for now (see the flag). Once a
  // connection exists, hide the "Connect" button until the cap is lifted.
  const canAddConnection =
    ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER || typeCredentials.length === 0;

  const [openCreateCredential, setOpenCreateCredential] = useState(false);
  const [credentialDeletion, setCredentialDeletion] = useState<Credential>();
  const [openSource, setOpenSource] = useState(""); // "new" | source id | ""
  const [sourceDeletion, setSourceDeletion] = useState<Source>();
  const [detailsId, setDetailsId] = useState("");
  const [detailsEditing, setDetailsEditing] = useState(false);

  const doDeleteSource = useMutation(deleteSource, {
    onSuccess: () => {
      setSourceDeletion(undefined);
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const doEnableSource = useMutation(editSource, {
    onSuccess: () => queryClient.invalidateQueries(["sources"]),
  });
  const doDeleteCredential = useMutation(deleteCredential, {
    onSuccess: () => {
      setCredentialDeletion(undefined);
      queryClient.invalidateQueries(["credentials"]);
    },
  });

  const getSourceFromId = (id: string) =>
    id === "new" ? undefined : typeSources.find((s) => s._id === id);

  const openDetails = (sourceId: string, editing = false) => {
    setDetailsEditing(editing);
    setDetailsId(sourceId);
  };
  const closeDetails = () => {
    setDetailsId("");
    setDetailsEditing(false);
  };

  // Peek at a feed's warnings without opening the details popup. The list
  // payload strips `events`, so fetch the source detail for the latest message.
  const showWarnings = async (source: Source) => {
    const count = source.distinctErrorCount;
    const plural = count === 1 ? "warning" : "warnings";
    const t = toast.loading(`Loading warnings for ${source.nickname}…`);
    try {
      const full = await queryClient.fetchQuery(["source", source._id], () =>
        getSource(source._id)
      );
      const events = full?.events ?? [];
      const latest = events.length
        ? [...events].sort(
            (a, b) =>
              new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
          )[0]
        : undefined;
      const summary = latest
        ? `${count} ${plural} — latest: ${latest.message} (${new Date(
            latest.datetime
          ).toLocaleString()})`
        : `${count} ${plural} for ${source.nickname}`;
      toast(summary, { id: t, icon: "⚠️" });
    } catch {
      toast.error(`Couldn't load warnings for ${source.nickname}`, { id: t });
    }
  };

  return (
    <section className='mb-6'>
      <div className='flex flex-wrap justify-between items-center gap-2 mb-2'>
        <h2 className='text-xl font-semibold'>{label}</h2>
        {isManager && canAddConnection && (
          <AggieButton
            onClick={() => setOpenCreateCredential(true)}
            variant='primary'
            padding='px-2 py-1'
            className='text-sm'
            icon={faPlusCircle}
          >
            Connect {label}
          </AggieButton>
        )}
      </div>

      {/* Connections for this provider */}
      {isManager && (
        <>
          <p className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-1'>
            Connections
          </p>
          <div className='flex flex-wrap items-center gap-2 mb-3'>
            {typeCredentials.length > 0 ? (
              typeCredentials.map((credential) => (
                <span
                  key={credential._id}
                  className='flex items-center gap-2 bg-slate-200 dark:bg-gray-600 rounded-full pl-3 pr-1 py-1 text-sm font-medium'
                >
                  <FontAwesomeIcon
                    icon={faKey}
                    size='xs'
                    className='text-slate-500 dark:text-gray-400'
                  />
                  {credential.name}
                  <button
                    type='button'
                    onClick={() => setCredentialDeletion(credential)}
                    title='Delete connection'
                    className='hover:bg-slate-300 dark:hover:bg-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-slate-500 dark:text-gray-300'
                  >
                    <FontAwesomeIcon icon={faTrash} size='xs' />
                  </button>
                </span>
              ))
            ) : (
              <p className='text-sm text-slate-500 dark:text-gray-400'>
                No {label} connections yet.
              </p>
            )}
          </div>
        </>
      )}

      {/* Feeds for this provider */}
      {isManager && (
        <p className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-1'>
          Feeds
        </p>
      )}
      <div className='bg-white dark:bg-gray-800 rounded-lg border border-slate-300 divide-y divide-slate-300'>
        {typeSources.length > 0 ? (
          typeSources.map((source) => (
            <article
              key={source._id}
              className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between py-3 px-3 text-slate-600 dark:text-gray-400 text-xs font-medium'
            >
              <main className='min-w-0 lg:flex-1'>
                <h3 className='font-bold truncate'>{source.nickname}</h3>
                <p className='text-sm break-words'>{source.keywords}</p>
              </main>
              <div className='flex flex-wrap items-center gap-2'>
                {isManager && (
                  <p className='bg-slate-200 dark:bg-gray-600 rounded-full px-2 max-w-full py-1'>
                    <span
                      className='flex items-center gap-2 min-w-0'
                      title='Connection'
                    >
                      <FontAwesomeIcon
                        icon={faKey}
                        size='xs'
                        className='text-slate-500 dark:text-gray-400 shrink-0'
                      />
                      <span className='truncate'>{source.credentials.name}</span>
                    </span>
                  </p>
                )}
                {source.distinctErrorCount > 0 && (
                  <p className='flex items-center gap-2 bg-orange-100 rounded-full px-2 w-fit py-1 shrink-0'>
                    <button
                      type='button'
                      onClick={() => showWarnings(source)}
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
                <div className='flex items-center gap-2 lg:justify-end shrink-0'>
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
                    variant='secondary'
                    className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 border border-slate-300'
                    panelClassName='overflow-hidden right-0 text-sm'
                    buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
                  >
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full'
                      onClick={() => openDetails(source._id)}
                    >
                      <FontAwesomeIcon icon={faEye} />
                      View details
                    </AggieButton>
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full'
                      onClick={() => openDetails(source._id, true)}
                    >
                      <FontAwesomeIcon icon={faEdit} />
                      Edit
                    </AggieButton>
                    <AggieButton
                      className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-red-600'
                      onClick={() => setSourceDeletion(source)}
                    >
                      <FontAwesomeIcon icon={faTrashAlt} />
                      Permanently Delete
                    </AggieButton>
                  </DropdownMenu>
                </div>
              )}
            </article>
          ))
        ) : (
          <p className='px-3 py-4 text-sm text-slate-500 dark:text-gray-400'>
            No {label} feeds yet.
          </p>
        )}
        {isManager && (
          <div className='px-3 py-3'>
            <AggieButton
              onClick={() => setOpenSource("new")}
              variant='teal'
              padding='px-2 py-1'
              className='text-sm'
              icon={faPlusCircle}
              disabled={typeCredentials.length === 0}
              title={
                typeCredentials.length === 0
                  ? `Connect ${label} first`
                  : undefined
              }
            >
              Add feed
            </AggieButton>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {isManager && (
        <>
          <AggieDialog
            isOpen={openCreateCredential}
            onClose={() => setOpenCreateCredential(false)}
            data={{ title: `Connect ${label}` }}
            className='p-3 w-full max-w-lg'
          >
            <CreateCredentialForm
              lockedType={type}
              onClose={() => setOpenCreateCredential(false)}
            />
          </AggieDialog>

          <ConfirmationDialog
            isOpen={!!credentialDeletion}
            variant='danger'
            disabled={doDeleteCredential.isLoading}
            className='w-full max-w-lg text-center'
            title={`Delete connection: ${credentialDeletion?.name}?`}
            confirmText={"Delete"}
            onClose={() => setCredentialDeletion(undefined)}
            onConfirm={() =>
              !!credentialDeletion &&
              doDeleteCredential.mutate(credentialDeletion)
            }
          ></ConfirmationDialog>

          <AggieDialog
            isOpen={!!openSource}
            onClose={() => setOpenSource("")}
            data={{
              title:
                openSource === "new" ? (
                  <>
                    Add{" "}
                    <span className='font-bold text-green-800 dark:text-green-600'>
                      {label}
                    </span>{" "}
                    feed
                  </>
                ) : (
                  "Edit feed"
                ),
            }}
            className='p-3 w-full max-w-lg'
          >
            <CreateEditSourceForm
              source={getSourceFromId(openSource)}
              defaultType={type}
              onClose={() => setOpenSource("")}
            />
          </AggieDialog>

          <ConfirmationDialog
            isOpen={!!sourceDeletion}
            variant='danger'
            disabled={doDeleteSource.isLoading}
            className='w-full max-w-lg text-center'
            title={`Delete feed: ${sourceDeletion?.nickname}?`}
            confirmText={"Delete"}
            onClose={() => setSourceDeletion(undefined)}
            onConfirm={() =>
              !!sourceDeletion && doDeleteSource.mutate(sourceDeletion)
            }
          ></ConfirmationDialog>
        </>
      )}

      <AggieDialog
        isOpen={!!detailsId}
        onClose={closeDetails}
        className='p-3 w-full max-w-2xl'
      >
        <SourceDetailsView
          id={detailsId}
          onClose={closeDetails}
          initialEditing={detailsEditing}
        />
      </AggieDialog>
    </section>
  );
};

export default ApiTypeSection;
