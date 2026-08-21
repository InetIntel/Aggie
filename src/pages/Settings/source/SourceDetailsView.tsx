import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteSource, editSource, getSource } from "../../../api/sources";
import { getSession } from "../../../api/session";
import { getTeams } from "../../../api/teams";
import type { SourceEvent } from "../../../api/session/types";
import type { Source } from "../../../api/sources/types";
import type { Team } from "../../../api/teams/types";
import { getAllowMultipleConnections, providerLabel } from "../../../api/common";

import AggieSwitch from "../../../components/AggieSwitch";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import CreateEditSourceForm from "./CreateEditSourceForm";

import {
  faChevronDown,
  faEdit,
  faEllipsisH,
  faExclamationTriangle,
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

// Splits the `lists` field (a comma/space-separated string) into hashtags,
// mirroring how the edit form's MastodonHashtagField parses them.
const parseHashtags = (raw?: string) =>
  (raw || "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean);

const MASTODON_MODE_LABELS: Record<string, string> = {
  public: "Public timeline",
  home: "Home timeline",
  hashtag: "Hashtag",
  keyword: "Keyword search",
};

const MASTODON_SCOPE_LABELS: Record<string, string> = {
  local: "Local public timeline",
  public: "Federated public timeline",
};

const ACCESS_MODE_LABELS: Record<string, string> = {
  public: "Public",
  restricted: "Restricted to teams",
  public_until: "Public until cutoff date",
};

// Read-only rows describing a feed's provider-specific configuration — the same
// fields the edit form exposes as inputs. Empty values are omitted so a feed
// with no extra config simply shows no rows.
const getSourceConfigRows = (
  source?: Source
): { label: string; value: ReactNode; hint?: ReactNode }[] => {
  if (!source) return [];
  const rows: { label: string; value: ReactNode; hint?: ReactNode }[] = [];

  switch (source.media) {
    case "mastodon": {
      const mode = source.keywords || "";
      if (mode)
        rows.push({ label: "Mode", value: MASTODON_MODE_LABELS[mode] || mode });
      if (mode === "hashtag") {
        const tags = parseHashtags(source.lists);
        if (tags.length)
          rows.push({
            label: tags.length === 1 ? "Hashtag" : "Hashtags",
            value: (
              <div className='flex flex-wrap gap-2'>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className='inline-flex items-center rounded-full bg-slate-200 dark:bg-gray-600 px-2 py-1 text-sm font-medium'
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ),
            hint:
              tags.length === 1
                ? "We pull in posts that use this hashtag."
                : "We pull in posts that use any of these hashtags, without repeating a post that has more than one.",
          });
      } else if (mode === "keyword") {
        if (source.lists) rows.push({ label: "Keyword", value: source.lists });
      } else if (mode === "public") {
        if (source.regex)
          rows.push({
            label: "Public timeline scope",
            value: MASTODON_SCOPE_LABELS[source.regex] || source.regex,
          });
      }
      break;
    }
    case "junkipedia":
      if (source.lists)
        rows.push({
          label: "Lists",
          value: source.lists,
          hint: "Junkipedia List IDs. Each one points to a monitoring list (a saved set of accounts, channels, hashtags, or search terms). Aggie collects the posts from these lists as Alerts.",
        });
      break;
    case "telegramUser":
      if (source.lists)
        rows.push({
          label: "Chats / Channels / Users",
          value: source.lists,
          hint: "The Telegram entities this feed pulls from, such as public usernames like @channel_one or private chat/channel IDs like -1001234567890.",
        });
      break;
    case "ioda":
    case "cloudflare":
      if (source.keywords)
        rows.push({ label: "Country code", value: source.keywords });
      break;
    default:
      break;
  }

  return rows;
};

// Normalizes accessPolicy.teams (which may be ids or populated Team objects)
// to an array of ids, matching getSourceAccessTeamIds in CreateEditSourceForm.
const getAccessTeamIds = (source?: Source) =>
  (source?.accessPolicy?.teams || []).map((team) =>
    typeof team === "string" ? team : team._id
  );

// Read-only detail: an eyebrow-style label (uppercase, bold, muted — matching
// the "Provider"/"Connections"/"Feeds" labels on the Feeds page) with its value
// left-aligned directly underneath. An optional `hint` renders the same
// helper-text the edit form shows under its labels — directly beneath the label
// and above the value — so view + edit read alike. No bordered box, so it reads
// as displayed info rather than a locked-down form input.
const DetailField = ({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) => (
  <div className='flex flex-col gap-1'>
    <span className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400'>
      {label}
    </span>
    {hint && (
      <p className='text-xs text-slate-500 dark:text-gray-400'>{hint}</p>
    )}
    <div className='text-black dark:text-gray-300'>{children}</div>
  </div>
);

// Close "X" shown in the modal header (only when rendered in a popup).
const CloseButton = ({ onClose }: { onClose: () => void }) => (
  <AggieButton
    onClick={onClose}
    className='px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-gray-400'
    aria-label='Close'
  >
    <FontAwesomeIcon icon={faXmark} />
  </AggieButton>
);

// Shared source-details content used by both the standalone page and the popup
// opened from the sources list.
const SourceDetailsView = ({ id, onClose, initialEditing = false }: IProps) => {
  const queryClient = useQueryClient();
  const { data } = useQuery(["source", id], () => getSource(id), {
    enabled: !!id,
    // The feed-list badge (["sources"]) and this panel (["source", id]) come
    // from separate endpoints fetched at different times, so the list badge can
    // drift as fetching appends events. Push this fresh count back into the list
    // cache so the badge matches the warnings shown here (mirrors
    // WarningsDialogBody on the Connections page).
    onSuccess: (fresh) => {
      if (!fresh) return;
      queryClient.setQueryData<Source[] | undefined>(["sources"], (old) =>
        old?.map((s) =>
          s._id === id
            ? { ...s, distinctErrorCount: fresh.distinctErrorCount }
            : s
        )
      );
    },
  });
  const { data: session } = useQuery(["session"], getSession);
  const { data: teams } = useQuery(["teams"], getTeams, { staleTime: 50000 });
  const doEditSource = useMutation(editSource, {
    onSuccess: () => {
      queryClient.invalidateQueries(["source", id]);
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const [deletionModal, setDeletionModal] = useState(false);
  const [editing, setEditing] = useState(initialEditing);
  const [activityOpen, setActivityOpen] = useState(false);
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

  // Read-only config derived from the same fields the edit form exposes.
  const configRows = getSourceConfigRows(data);
  const accessMode = data?.accessPolicy?.mode || "public";
  const accessTeamNames = getAccessTeamIds(data).map(
    (teamId) => teams?.find((team: Team) => team._id === teamId)?.name || teamId
  );
  const accessShowsTeams =
    accessMode === "restricted" || accessMode === "public_until";

  return (
    <div>
      {editing ? (
        <div className='flex flex-col'>
          <div className='flex justify-between items-center mb-3 gap-4'>
            <h2 className='text-xl font-medium'>Edit feed</h2>
            {onClose && <CloseButton onClose={onClose} />}
          </div>
          <CreateEditSourceForm
            source={data}
            allowMultipleConnections={getAllowMultipleConnections()}
            onClose={() => {
              // The edit mutation only invalidates ["sources"]; refresh this
              // panel's ["source", id] query so the read view shows the saved
              // values instead of stale data.
              queryClient.invalidateQueries(["source", id]);
              // When we opened straight into the edit form (e.g. "Edit" from the
              // providers list), closing/cancelling should dismiss the whole
              // panel rather than drop the user onto the view-details screen
              // they never asked for. Only fall back to the read view when edit
              // was toggled on from within view details.
              if (initialEditing && onClose) {
                onClose();
              } else {
                setEditing(false);
              }
            }}
          />
        </div>
      ) : (
        <>
          <div className='flex justify-between items-center mb-3 gap-4'>
            <h2 className='text-xl font-medium'>
              View{" "}
              <span className='font-bold text-green-800 dark:text-green-600'>
                {data?.nickname}
              </span>{" "}
              details
            </h2>
            <div className='flex items-center gap-4'>
              {isManager && (
                <>
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
                    className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-400'
                    panelClassName='bg-white dark:bg-gray-800 border border-slate-300 rounded-lg overflow-hidden right-0 text-sm'
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
                      Delete
                    </AggieButton>
                  </DropdownMenu>
                </>
              )}
              {onClose && <CloseButton onClose={onClose} />}
            </div>
          </div>
          <div className='flex flex-col gap-3'>
            <DetailField label='Provider'>
              {providerLabel(data?.media)}
            </DetailField>

            {isManager && (
              <DetailField label='Connection'>
                <span
                  className='flex items-center gap-2 w-fit'
                  title='Connection'
                >
                  <FontAwesomeIcon
                    icon={faKey}
                    size='xs'
                    className='text-slate-500 dark:text-gray-400'
                  />
                  {data?.credentials.name}
                </span>
              </DetailField>
            )}

            {configRows.map((row) => (
              <DetailField key={row.label} label={row.label} hint={row.hint}>
                {row.value}
              </DetailField>
            ))}

            {isManager && (
              <>
                <DetailField
                  label='Access'
                  hint='Controls whether this feed is broadly visible or restricted to specific teams.'
                >
                  {ACCESS_MODE_LABELS[accessMode] || accessMode}
                </DetailField>
                {accessMode === "public_until" &&
                  data?.accessPolicy?.cutoffDate && (
                    <DetailField
                      label='Cutoff date'
                      hint='Data before this date is treated as public. Data after this date is restricted to the selected teams.'
                    >
                      {data.accessPolicy.cutoffDate.slice(0, 10)}
                    </DetailField>
                  )}
                {accessShowsTeams && (
                  <DetailField label='Allowed teams'>
                    {accessTeamNames.length ? (
                      accessTeamNames.join(", ")
                    ) : (
                      <span className='text-slate-500 dark:text-gray-400'>
                        None
                      </span>
                    )}
                  </DetailField>
                )}
              </>
            )}

            <DetailField label='Created by'>
              <Link
                to={`/settings/user/${data?.user._id}`}
                className='hover:underline text-blue-600'
              >
                {data?.user.username}
              </Link>
            </DetailField>

            <DetailField label='Tags'>
              {data?.tags ? (
                data.tags
              ) : (
                <span className='text-slate-500 dark:text-gray-400'>None</span>
              )}
            </DetailField>

            <div className='flex flex-col gap-1'>
              <button
                type='button'
                onClick={() => setActivityOpen((open) => !open)}
                className='flex items-center gap-2 w-fit text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                aria-expanded={activityOpen}
              >
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`transition-transform ${
                    activityOpen ? "rotate-180" : ""
                  }`}
                />
                Recent activity
                {(data?.distinctErrorCount ?? 0) > 0 && (
                  <span className='flex items-center gap-1 bg-orange-100 rounded-full px-2 py-0.5 text-orange-800 normal-case tracking-normal'>
                    <FontAwesomeIcon
                      icon={faExclamationTriangle}
                      size='xs'
                      className='text-orange-600'
                    />
                    {data?.distinctErrorCount}{" "}
                    {data?.distinctErrorCount === 1 ? "Warning" : "Warnings"}
                  </span>
                )}
              </button>
              {activityOpen && (
                <div className='rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 overflow-hidden'>
                  <div className='grid grid-cols-4 px-3 py-2 border-b border-slate-300 text-xs font-semibold uppercase tracking-wide'>
                    <p>Time</p>
                    <p>Level</p>
                    <p className='col-span-2'>Message</p>
                  </div>
                  {data?.events && data.events.length > 0 ? (
                    // Backend returns events oldest-first; show newest-first here.
                    [...data.events]
                      .sort(
                        (a: SourceEvent, b: SourceEvent) =>
                          new Date(b.datetime).getTime() -
                          new Date(a.datetime).getTime()
                      )
                      .map((event: SourceEvent, index: number) => (
                        <div
                          className='grid grid-cols-4 px-3 py-2 text-sm text-black dark:text-gray-300 border-t border-slate-200 dark:border-gray-700 first:border-t-0'
                          key={index}
                        >
                          <p>{new Date(event.datetime).toLocaleString()}</p>
                          {/* Backend logs every fetch failure as type "error"; show
                              these as "Warning" (matching the badge/warnings popup),
                              but pass through any other explicit level verbatim. */}
                          <p>
                            {event.type === "error" ? "Warning" : event.type}
                          </p>
                          <p className='col-span-2 break-words'>
                            {event.message}
                          </p>
                        </div>
                      ))
                  ) : (
                    <p className='px-3 py-2 text-sm text-slate-500 dark:text-gray-400'>
                      No events found.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
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
