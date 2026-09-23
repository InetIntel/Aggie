import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { deleteSource, getSource } from "../../../api/sources";
import type { Source } from "../../../api/sources/types";
import type { SourceEvent } from "../../../api/session/types";
import { deleteCredential, editCredential } from "../../../api/credentials";
import type { Credential } from "../../../api/credentials/types";
import { providerLabel, type CredentialOption } from "../../../api/common";

import * as Yup from "yup";
import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import FormikInput from "../../../components/FormikInput";
import FormikWithSchema from "../../../components/FormikWithSchema";
import CreateEditSourceForm from "../source/CreateEditSourceForm";
import SourceDetailsView from "../source/SourceDetailsView";
import { feedTypeLabel } from "../source/sourceDisplay";
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
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

interface IProps {
  type: CredentialOption;
  sources: Source[];
  credentials: Credential[];
  canManageConnections: boolean;
  canManageSources: boolean;
  // Toggle from the Feeds page: allow more than one connection per provider.
  allowMultipleConnections: boolean;
}

// One card per provider on the Feeds page. Co-locates that provider's
// connections ("Connect {provider}") and its feeds ("Add feed"), reusing the
// same dialogs/mutations the standalone sections use.
const ApiTypeSection = ({
  type,
  sources,
  credentials,
  canManageConnections,
  canManageSources,
  allowMultipleConnections,
}: IProps) => {
  const queryClient = useQueryClient();
  const label = providerLabel(type);

  const typeSources = sources.filter((source) => source.media === type);
  const typeCredentials = credentials.filter((cred) => cred.type === type);

  // When multiple connections per provider are disabled, hide the "Connect"
  // button once a connection exists (one connection per provider).
  const canAddConnection =
    allowMultipleConnections || typeCredentials.length === 0;

  // Group this provider's feeds by their feed-type label, ordered alphabetically
  // by type; feeds within a group are sorted by nickname.
  const feedGroups = Object.entries(
    typeSources.reduce<Record<string, Source[]>>((acc, source) => {
      const key = feedTypeLabel(source) || "Other";
      (acc[key] = acc[key] || []).push(source);
      return acc;
    }, {})
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, list]) => ({
      type,
      sources: [...list].sort((a, b) =>
        (a.nickname || "").localeCompare(b.nickname || "")
      ),
    }));

  const [openCreateCredential, setOpenCreateCredential] = useState(false);
  const [credentialDeletion, setCredentialDeletion] = useState<Credential>();
  const [credentialEdit, setCredentialEdit] = useState<Credential>();
  const [openSource, setOpenSource] = useState(""); // "new" | source id | ""
  const [sourceDeletion, setSourceDeletion] = useState<Source>();
  const [detailsId, setDetailsId] = useState("");
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [warningsSource, setWarningsSource] = useState<Source>();

  const doDeleteSource = useMutation(deleteSource, {
    onSuccess: () => {
      setSourceDeletion(undefined);
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const doDeleteCredential = useMutation(deleteCredential, {
    onSuccess: () => {
      setCredentialDeletion(undefined);
      queryClient.invalidateQueries(["credentials"]);
    },
  });
  const doEditCredential = useMutation(editCredential, {
    onSuccess: () => {
      setCredentialEdit(undefined);
      queryClient.invalidateQueries(["credentials"]);
      // Feed rows show `source.credentials.name`, so refresh sources too.
      queryClient.invalidateQueries(["sources"]);
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
    <section className="mb-6">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
            Provider
          </p>
          <h2 className="text-xl font-bold text-green-800 dark:text-green-600">
            {label}
          </h2>
        </div>
        {canManageConnections && canAddConnection && (
          <AggieButton
            onClick={() => setOpenCreateCredential(true)}
            variant="primary"
            padding="px-2 py-1"
            className="text-sm"
            icon={faPlusCircle}
          >
            Connect {label}
          </AggieButton>
        )}
      </div>

      {/* Connections for this provider */}
      {canManageConnections && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-1">
            {allowMultipleConnections ? "Connections" : "Connection"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {typeCredentials.length > 0 ? (
              typeCredentials.map((credential) => (
                <span
                  key={credential._id}
                  className="flex items-center gap-1.5 bg-slate-200 dark:bg-gray-600 rounded-full pl-2.5 pr-1 py-0.5 text-xs font-medium"
                >
                  <FontAwesomeIcon
                    icon={faKey}
                    size="xs"
                    className="text-slate-500 dark:text-gray-400"
                  />
                  {credential.name}
                  <button
                    type="button"
                    onClick={() => setCredentialEdit(credential)}
                    title="Edit connection"
                    className="bg-[#F0F5FF] hover:bg-slate-100 dark:hover:bg-gray-500 shadow-sm rounded-full w-5 h-5 flex items-center justify-center text-slate-600 dark:text-gray-700"
                  >
                    <FontAwesomeIcon icon={faEdit} size="xs" />
                  </button>
                </span>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-gray-400">
                No {label} connections yet.
              </p>
            )}
          </div>
        </>
      )}

      {/* Feeds for this provider */}
      {canManageSources && (
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-1">
          Feeds
        </p>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-300">
        {typeSources.length > 0 ? (
          feedGroups.map((group) => (
            <div
              key={group.type}
              className="border-t border-slate-300 first:border-t-0"
            >
              <div className="divide-y divide-slate-200 dark:divide-gray-700">
                {group.sources.map((source) => (
                  <article
                    key={source._id}
                    className="flex flex-col gap-1 py-1.5 px-3 text-slate-600 dark:text-gray-400 text-xs font-medium"
                  >
              {/* Control line: connection, warnings, enable toggle, menu */}
              <div className="flex flex-wrap items-center gap-1">
                {canManageSources && (
                  <p className="bg-slate-200 dark:bg-gray-600 rounded-full px-1.5 max-w-full py-0.5 text-[14px]">
                    <span
                      className="flex items-center gap-1.5 min-w-0"
                      title="Connection"
                    >
                      <FontAwesomeIcon
                        icon={faKey}
                        size="xs"
                        className="text-slate-500 dark:text-gray-400 shrink-0"
                      />
                      <span className="truncate">
                        {source.credentials.name}
                      </span>
                    </span>
                  </p>
                )}
                {source.distinctErrorCount > 0 && (
                  <p className="flex items-center gap-1.5 bg-orange-100 rounded-full px-1.5 w-fit py-0.5 text-[14px] shrink-0">
                    <button
                      type="button"
                      onClick={() => setWarningsSource(source)}
                      className="hover:underline text-orange-800 flex items-center gap-1.5"
                      title="Errors while fetching this feed"
                    >
                      <FontAwesomeIcon
                        icon={faExclamationTriangle}
                        size="xs"
                        className="text-orange-600"
                      />
                      {source.distinctErrorCount}{" "}
                      {source.distinctErrorCount === 1 ? "Warning" : "Warnings"}
                    </button>
                  </p>
                )}

                {canManageSources && (
                  <div className="flex items-center gap-2 ml-auto">
                    <DropdownMenu
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-400"
                      panelClassName="bg-white dark:bg-gray-800 border border-slate-300 rounded-lg overflow-hidden right-0 text-sm"
                      buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
                    >
                      <AggieButton
                        className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full"
                        onClick={() => openDetails(source._id)}
                      >
                        <FontAwesomeIcon icon={faEye} />
                        View details
                      </AggieButton>
                      <AggieButton
                        className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full"
                        onClick={() => openDetails(source._id, true)}
                      >
                        <FontAwesomeIcon icon={faEdit} />
                        Edit
                      </AggieButton>
                      <AggieButton
                        className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-red-600"
                        onClick={() => setSourceDeletion(source)}
                      >
                        <FontAwesomeIcon icon={faTrashAlt} />
                        Delete
                      </AggieButton>
                    </DropdownMenu>
                  </div>
                )}
              </div>
              {/* Title line: bold uppercase type + italic nickname */}
              <div className="flex flex-wrap items-baseline min-w-0">
                <h3 className="font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400 break-words">
                  {feedTypeLabel(source)}
                </h3>
                {source.nickname && (
                  <span className="italic text-slate-800 dark:text-gray-100 break-words">
                    <span className="not-italic font-normal text-slate-400 mx-1">
                      -
                    </span>
                    {source.nickname}
                  </span>
                )}
              </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="px-3 py-4 text-sm text-slate-500 dark:text-gray-400">
            No {label} feeds yet.
          </p>
        )}
        {canManageSources && (
          <div className="px-3 py-3 border-t border-slate-300">
            <AggieButton
              onClick={() => setOpenSource("new")}
              variant="teal"
              padding="px-2 py-1"
              className="text-sm"
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
      {(canManageConnections || canManageSources) && (
        <>
          <AggieDialog
            isOpen={openCreateCredential}
            onClose={() => setOpenCreateCredential(false)}
            className="p-3 w-full max-w-lg"
          >
            <div className="flex justify-between items-center mb-2 gap-4">
              <h2 className="text-xl font-medium">
                Connect{" "}
                <span className="font-bold text-green-800 dark:text-green-600">
                  {label}
                </span>
              </h2>
              <AggieButton
                onClick={() => setOpenCreateCredential(false)}
                className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-gray-400"
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faXmark} />
              </AggieButton>
            </div>
            <CreateCredentialForm
              lockedType={type}
              onClose={() => setOpenCreateCredential(false)}
            />
          </AggieDialog>

          <ConfirmationDialog
            isOpen={!!credentialDeletion}
            variant="danger"
            disabled={doDeleteCredential.isLoading}
            className="w-full max-w-lg text-center"
            title={`Delete connection: ${credentialDeletion?.name}?`}
            confirmText={"Delete"}
            onClose={() => {
              // Cancelling delete returns to the edit form it was opened from,
              // rather than dropping the user back to the page.
              setCredentialEdit(credentialDeletion);
              setCredentialDeletion(undefined);
            }}
            onConfirm={() =>
              !!credentialDeletion &&
              doDeleteCredential.mutate(credentialDeletion)
            }
          ></ConfirmationDialog>

          <AggieDialog
            isOpen={!!credentialEdit}
            onClose={() => setCredentialEdit(undefined)}
            className="p-3 w-full max-w-lg"
          >
            {credentialEdit && (
              <RenameConnectionForm
                credential={credentialEdit}
                loading={doEditCredential.isLoading}
                onClose={() => setCredentialEdit(undefined)}
                onSave={(name) =>
                  doEditCredential.mutate({ ...credentialEdit, name })
                }
                onDelete={() => {
                  // Hand off to the existing delete confirmation dialog.
                  setCredentialDeletion(credentialEdit);
                  setCredentialEdit(undefined);
                }}
              />
            )}
          </AggieDialog>

          <AggieDialog
            isOpen={!!openSource}
            onClose={() => setOpenSource("")}
            className="p-3 w-full max-w-lg"
          >
            <div className="flex justify-between items-center mb-2 gap-4">
              <h2 className="text-xl font-medium">
                {openSource === "new" ? (
                  <>
                    Add{" "}
                    <span className="font-bold text-green-800 dark:text-green-600">
                      {label}
                    </span>{" "}
                    feed
                  </>
                ) : (
                  "Edit feed"
                )}
              </h2>
              <AggieButton
                onClick={() => setOpenSource("")}
                className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-gray-400"
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faXmark} />
              </AggieButton>
            </div>
            <CreateEditSourceForm
              source={getSourceFromId(openSource)}
              defaultType={type}
              allowMultipleConnections={allowMultipleConnections}
              onClose={() => setOpenSource("")}
            />
          </AggieDialog>

          <ConfirmationDialog
            isOpen={!!sourceDeletion}
            variant="danger"
            disabled={doDeleteSource.isLoading}
            className="w-full max-w-lg text-center"
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
        className="p-3 w-full max-w-lg"
      >
        <SourceDetailsView
          id={detailsId}
          onClose={closeDetails}
          initialEditing={detailsEditing}
        />
      </AggieDialog>

      <AggieDialog
        isOpen={!!warningsSource}
        onClose={() => setWarningsSource(undefined)}
        className="p-3 w-full max-w-lg"
      >
        {warningsSource && (
          <WarningsDialogBody
            source={warningsSource}
            onClose={() => setWarningsSource(undefined)}
          />
        )}
      </AggieDialog>
    </section>
  );
};

// Rename dialog body for a connection. Name-only edit; the schema mirrors the
// backend's nameValidator (1-20 chars). FormikWithSchema provides Save/Cancel
// and gates submission on `dirty`, so an unchanged name can't be submitted.
const renameConnectionSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .required("Connection name required")
    .max(50, "Max 50 characters"),
});

const RenameConnectionForm = ({
  credential,
  loading,
  onSave,
  onClose,
  onDelete,
}: {
  credential: Credential;
  loading: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-2 gap-4">
        <h2 className="text-xl font-medium">Edit connection</h2>
        <AggieButton
          onClick={onClose}
          className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-gray-400"
          aria-label="Close"
        >
          <FontAwesomeIcon icon={faXmark} />
        </AggieButton>
      </div>
      <FormikWithSchema
        schema={renameConnectionSchema}
        initialValues={{ name: credential.name }}
        onSubmit={(values: { name: string }) => onSave(values.name.trim())}
        loading={loading}
        onSubmitText="Save"
        onClose={onClose}
      >
        <FormikInput name="name" label="Connection name" maxLength={50} />
      </FormikWithSchema>
      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-gray-700">
        <AggieButton
          type="button"
          onClick={onDelete}
          disabled={loading}
          variant="secondary"
          className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
          icon={faTrash}
        >
          Delete connection
        </AggieButton>
      </div>
    </div>
  );
};

// Warnings popup body: the feed list payload strips `events`, so fetch the full
// source detail on demand and list every warning (newest first).
const WarningsDialogBody = ({
  source,
  onClose,
}: {
  source: Source;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    ["source", source._id],
    () => getSource(source._id),
    {
      enabled: !!source._id,
      // The feed-list badge (["sources"]) and this popup (["source", id]) come
      // from separate endpoints fetched at different times, so the list badge
      // can be stale as fetching appends events. Push this fresh count back into
      // the list cache so the badge matches exactly what the popup lists.
      onSuccess: (fresh) => {
        if (!fresh) return;
        queryClient.setQueryData<Source[] | undefined>(["sources"], (old) =>
          old?.map((s) =>
            s._id === source._id
              ? { ...s, distinctErrorCount: fresh.distinctErrorCount }
              : s,
          ),
        );
      },
    },
  );
  const events = [...(data?.events ?? [])].sort(
    (a: SourceEvent, b: SourceEvent) =>
      new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-2 gap-4">
        <h2 className="text-xl font-medium">Warnings for {source.nickname}</h2>
        <AggieButton
          onClick={onClose}
          className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-gray-400"
          aria-label="Close"
        >
          <FontAwesomeIcon icon={faXmark} />
        </AggieButton>
      </div>

      {isLoading ? (
        <p className="px-1 py-4 text-sm text-slate-500 dark:text-gray-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          Loading warnings…
        </p>
      ) : events.length > 0 ? (
        <section className="bg-white dark:bg-gray-800 rounded-lg px-1 py-1 flex flex-col gap-2 max-h-96 overflow-y-auto">
          <header className="grid grid-cols-4 border-slate-300 border-b text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 pb-1">
            <p>Time</p>
            <p>Level</p>
            <p className="col-span-2">Message</p>
          </header>
          {events.map((event: SourceEvent, index: number) => (
            <div className="grid grid-cols-4 text-sm" key={index}>
              <p className="text-slate-600 dark:text-gray-400">
                {new Date(event.datetime).toLocaleString()}
              </p>
              {/* Backend logs every fetch error as type "error"; the UI presents
                  these consistently as "Warning" to match the badge wording. */}
              <p>{event.type === "error" ? "Warning" : event.type}</p>
              <p className="col-span-2 break-words">{event.message}</p>
            </div>
          ))}
        </section>
      ) : (
        <p className="px-1 py-4 text-sm text-slate-500 dark:text-gray-400">
          No warnings found.
        </p>
      )}
    </div>
  );
};

export default ApiTypeSection;
