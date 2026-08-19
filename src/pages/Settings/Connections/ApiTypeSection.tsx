import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { deleteSource, editSource } from "../../../api/sources";
import type { Source } from "../../../api/sources/types";
import { deleteCredential } from "../../../api/credentials";
import type { Credential } from "../../../api/credentials/types";
import type { CredentialOption } from "../../../api/common";

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
  faKey,
  faPlusCircle,
  faSpinner,
  faTrash,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";

// Human-friendly heading for each API type.
const TYPE_LABELS: Record<CredentialOption, string> = {
  junkipedia: "Junkipedia",
  telegramUser: "Telegram",
  mastodon: "Mastodon",
  ioda: "Ioda",
  cloudflare: "Cloudflare",
};

interface IProps {
  type: CredentialOption;
  sources: Source[];
  credentials: Credential[];
  isManager: boolean;
}

// One card per API type on the consolidated Connections page. Co-locates that
// type's credentials ("Add {type} api") and its sources ("Add {type} source"),
// reusing the same dialogs/mutations the standalone sections use.
const ApiTypeSection = ({ type, sources, credentials, isManager }: IProps) => {
  const queryClient = useQueryClient();
  const label = TYPE_LABELS[type] ?? type;

  const typeSources = sources.filter((source) => source.media === type);
  const typeCredentials = credentials.filter((cred) => cred.type === type);

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

  return (
    <section className='mb-6'>
      <div className='flex flex-wrap justify-between items-center gap-2 mb-2'>
        <h2 className='text-xl font-semibold'>{label}</h2>
        {isManager && (
          <AggieButton
            onClick={() => setOpenCreateCredential(true)}
            variant='primary'
            padding='px-2 py-1'
            className='text-sm'
            icon={faPlusCircle}
          >
            Add {label} api
          </AggieButton>
        )}
      </div>

      {/* Credentials for this type */}
      {isManager && (
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
                  title='Delete credential'
                  className='hover:bg-slate-300 dark:hover:bg-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-slate-500 dark:text-gray-300'
                >
                  <FontAwesomeIcon icon={faTrash} size='xs' />
                </button>
              </span>
            ))
          ) : (
            <p className='text-sm text-slate-500 dark:text-gray-400'>
              No {label} credentials yet.
            </p>
          )}
        </div>
      )}

      {/* Sources for this type */}
      <div className='bg-white dark:bg-gray-800 rounded-lg border border-slate-300 divide-y divide-slate-300'>
        {typeSources.length > 0 ? (
          typeSources.map((source) => (
            <article
              key={source._id}
              className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between py-3 px-3 text-slate-600 dark:text-gray-400 text-xs font-medium'
            >
              <main className='min-w-0 lg:flex-1'>
                <button
                  type='button'
                  onClick={() => openDetails(source._id)}
                  className='hover:underline text-left max-w-full'
                >
                  <h3 className='font-medium text-blue-600 text-lg truncate'>
                    {source.nickname}
                  </h3>
                </button>
                <p className='text-sm break-words'>{source.keywords}</p>
              </main>
              <div className='flex flex-wrap items-center gap-2'>
                {isManager && (
                  <p className='bg-slate-200 dark:bg-gray-600 rounded-full px-2 max-w-full py-1'>
                    <span
                      className='flex items-center gap-2 min-w-0'
                      title='API Key Credential'
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
                <p className='flex items-center gap-2 bg-orange-100 rounded-full px-2 w-fit py-1 shrink-0'>
                  <button
                    type='button'
                    onClick={() => openDetails(source._id)}
                    className='hover:underline text-orange-800 flex items-center gap-2'
                    title='Errors due to fetching source'
                  >
                    <FontAwesomeIcon
                      icon={faExclamationTriangle}
                      size='xs'
                      className='text-orange-600'
                    />
                    {source.unreadErrorCount} Warnings
                  </button>
                </p>
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
                      label='Enable Source'
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
            No {label} sources yet.
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
                  ? `Add a ${label} credential first`
                  : undefined
              }
            >
              Add {label} source
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
            data={{ title: `Add ${label} credential` }}
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
            title={`Delete: ${credentialDeletion?.name}?`}
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
              title: openSource === "new" ? `Add ${label} source` : "Edit Source",
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
            title={`Delete: ${sourceDeletion?.nickname}?`}
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
