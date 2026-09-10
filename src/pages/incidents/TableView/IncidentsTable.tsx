import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faLock,
  faPencil,
  faTrash,
  faUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";

import type { Group } from "../../../api/groups/types";
import { getGroupReports } from "../../../api/groups";
import { useIncidentMutations } from "../useIncidentMutations";
import { IncidentOverallStatus } from "../IncidentStatuses";
import { CoverageBadge } from "../IncidentCoverage";
import ImpactedAsnTable from "../Incident/ImpactedAsnTable";
import GroupReportListItem from "../Incident/GroupReportListItem";
import AsnChips from "./AsnChips";
import { formatDurationFromSeconds } from "../../../utils/format";
import { useFormatters } from "../../../utils/useFormatters";

import DataTable from "../../../components/DataTable/DataTable";
import type {
  DataTableColumn,
  DataTableSelection,
} from "../../../components/DataTable/types";
import AggieDialog from "../../../components/AggieDialog";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import CreateEditIncidentForm from "../CreateEditIncidentForm";

interface IProps {
  data: Group[];
  isLoading?: boolean;
  selection?: DataTableSelection<Group>;
}

const formatAssignedTo = (group: Group) => {
  if (!group.assignedTo || group.assignedTo.length === 0) return null;
  return group.assignedTo
    .map((u) => ("username" in u && u.username) || "")
    .filter(Boolean)
    .join(", ");
};

const AlertsCount = ({ count }: { count: number }) => (
  <>
    <span
      className={`font-semibold ${
        count > 0
          ? "text-red-700 dark:text-red-300"
          : "text-slate-500 dark:text-gray-400"
      }`}
    >
      {count}
    </span>
    {count > 0 && (
      <span className="ml-1 text-xs text-slate-500 dark:text-gray-400">
        alerts
      </span>
    )}
  </>
);

// The incident's alerts, rendered the same way the incident detail page does
// (getGroupReports -> GroupReportListItem -> SocialMediaListItem). Mounted inside
// DataTable's expandedContent, which only renders when a row is expanded, so the
// per-incident fetch fires lazily on expand. Read-only here: select-mode props are
// stubbed since report management lives on the detail page.
const IncidentAlertsList = ({ groupId }: { groupId: string }) => {
  const { data, isLoading } = useQuery(
    ["groups", "reports", { groupId }],
    () => getGroupReports({ groupId })
  );
  if (isLoading)
    return (
      <span className="text-slate-500 dark:text-gray-400">Loading alerts…</span>
    );
  const results = data?.results ?? [];
  if (results.length === 0)
    return <span className="text-slate-500 dark:text-gray-400">No alerts.</span>;
  return (
    <div className="flex flex-col rounded-lg bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 divide-y divide-slate-200 dark:divide-gray-700">
      {results.map((report) => (
        <GroupReportListItem
          key={report._id}
          report={report}
          isChecked={false}
          isSelectMode={false}
          onCheckChange={() => {}}
        />
      ))}
    </div>
  );
};

const IncidentsTable = ({ data, isLoading, selection }: IProps) => {
  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const { doUpdate, doRemove } = useIncidentMutations();
  const { formatDateTime } = useFormatters();

  // Display order is fixed here; collapse order is encoded independently by
  // `collapsePriority` (higher = more persistent). As the table narrows, columns
  // collapse in this order: Assigned To → # Of Alerts → IPC → DPC → ASN →
  // Status → Date → Title; ID# has no priority so it always stays. Widths are the
  // per-column minimums.
  const columns: DataTableColumn<Group>[] = [
    {
      id: "idnum",
      header: "ID#",
      minWidth: 100,
      tdClassName:
        "text-slate-600 dark:text-gray-400 font-medium whitespace-nowrap",
      cell: (inc) => <>#{inc.idnum}</>,
    },
    {
      id: "title",
      header: "Incident Title",
      // Explicit px width (via `minWidth`), not auto. Under the table's fixed
      // layout a full-width `colSpan` cell — the expanded detail row — shrinks
      // any *auto*-width column to its min-content (title once collapsed to a
      // vertical single-letter stack on expand). An explicit width can't be
      // collapsed by the span; it also scales up to absorb slack (title is the
      // widest column, so it grows most) while the table never overflows.
      minWidth: 300,
      collapsePriority: 8,
      grow: true,
      thClassName: "pr-4",
      // Word-level wrapping only — NOT `overflow-wrap: anywhere`, which would drop
      // the min-content to one character. Long titles are clamped by
      // `line-clamp-2` and clipped by the cell's `overflow-hidden`.
      tdClassName: "pr-4",
      cell: (inc) => {
        const reportCount = inc._reports?.length ?? 0;
        return (
          <>
            <Link
              to={`/incidents/${inc._id}`}
              className="text-blue-700 hover:underline font-medium dark:text-blue-300 leading-snug break-words line-clamp-2"
              onClick={(e) => e.stopPropagation()}
            >
              {inc.title}
            </Link>
            <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {reportCount} {reportCount === 1 ? "report" : "reports"}
            </div>
            {inc.accessPolicy?.mode === "restricted" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100 px-1 rounded mt-1">
                <FontAwesomeIcon icon={faLock} /> Restricted
              </span>
            )}
          </>
        );
      },
    },
    {
      id: "date",
      header: "Date",
      minWidth: 220,
      collapsePriority: 7,
      noSpillover: true, // duration already shown in the expanded detail
      tdClassName: "whitespace-nowrap text-xs",
      cell: (inc) => (
        <>
          <div>{formatDateTime(inc.incidentStartedAt)}</div>
          <div className="text-slate-400 dark:text-gray-500 my-0.5">
            <FontAwesomeIcon icon={faArrowDown} size="xs" />
          </div>
          <div>{formatDateTime(inc.incidentEndedAt)}</div>
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      minWidth: 240,
      collapsePriority: 6,
      tdClassName: "whitespace-nowrap",
      cell: (inc) => (
        <IncidentOverallStatus
          group={inc}
          className="px-1.5 py-0.5 rounded-full font-medium text-xs text-slate-600 dark:text-gray-400 inline-flex gap-1 items-center no-underline w-fit"
        />
      ),
    },
    {
      // Left as-is pending a separate rework of ASN handling.
      id: "asn",
      header: "ASN / Geo Scope",
      minWidth: 160,
      collapsePriority: 5,
      tdClassName: "max-w-[10rem] align-top",
      cell: (inc) => {
        const scopes = inc.impactedGeoScopes ?? [];
        return (
          <div className="flex flex-col items-start gap-0.5 leading-tight max-w-[10rem]">
            <AsnChips asns={inc.impactedAsns} />
            {scopes.length > 0 && (
              <span className="text-xs text-slate-400 dark:text-gray-500 break-words">
                {scopes.join(" · ")}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "dpc",
      header: "DPC",
      minWidth: 100,
      collapsePriority: 4,
      noSpillover: true, // shown in the expanded detail metadata
      tdClassName: "whitespace-nowrap",
      cell: (inc) => (
        <CoverageBadge value={inc.directPopulationCoverageScore} />
      ),
    },
    {
      id: "ipc",
      header: "IPC",
      minWidth: 100,
      collapsePriority: 3,
      noSpillover: true, // shown in the expanded detail metadata
      tdClassName: "whitespace-nowrap",
      cell: (inc) => (
        <CoverageBadge value={inc.indirectPopulationCoverageScore} />
      ),
    },
    {
      id: "alertsReport",
      header: "# Of Alerts",
      minWidth: 100,
      collapsePriority: 2,
      noSpillover: true, // shown in the expanded detail metadata
      cell: (inc) => <AlertsCount count={inc._reports?.length ?? 0} />,
    },
    {
      id: "assignedTo",
      header: "Assigned To",
      minWidth: 140,
      collapsePriority: 1,
      noSpillover: true, // shown in the expanded detail metadata
      cell: (inc) =>
        formatAssignedTo(inc) || (
          <span className="text-slate-500 dark:text-gray-400">—</span>
        ),
    },
  ];

  return (
    <>
      <DataTable
        data={data}
        isLoading={isLoading}
        getRowKey={(inc) => inc._id}
        columns={columns}
        selection={selection}
        hideExpandBar
        connectedExpanded
        tableClassName="text-xs"
        actionsColWidth={176}
        rowActions={(inc) => (
          <div className="inline-flex items-center gap-2">
            <Link
              to={`/incidents/${inc._id}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`View incident #${inc.idnum}`}
              title={`View incident #${inc.idnum}`}
              className="text-slate-600 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-300 transition-colors p-1"
            >
              <FontAwesomeIcon icon={faUpRightFromSquare} />
            </Link>
            <button
              type="button"
              aria-label={`Edit incident ${inc.idnum}`}
              onClick={() => setEditTarget(inc)}
              className="text-green-800 hover:text-green-700 dark:text-green-300 dark:hover:text-green-200 transition-colors p-1"
            >
              <FontAwesomeIcon icon={faPencil} />
            </button>
            <button
              type="button"
              aria-label={`Delete incident ${inc.idnum}`}
              onClick={() => setDeleteTarget(inc)}
              className="text-slate-600 hover:text-red-700 dark:text-gray-400 dark:hover:text-red-300 transition-colors p-1"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        )}
        expandedContent={(inc) => (
          <div className="flex flex-col gap-4 text-xs">
          <div className="flex flex-col min-[1456px]:flex-row gap-y-4 gap-x-8">
            {/* Left: incident metadata as inline "Label: value" rows */}
            <div className="min-[1456px]:flex-1 min-[1456px]:min-w-0 flex flex-col gap-1">
              <div className="flex gap-1">
                <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                  Assigned To:
                </strong>
                {formatAssignedTo(inc) || (
                  <span className="text-slate-500 dark:text-gray-400">—</span>
                )}
              </div>
              <div className="flex gap-1 items-center">
                <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                  Direct Population Coverage:
                </strong>
                <CoverageBadge value={inc.directPopulationCoverageScore} />
              </div>
              <div className="flex gap-1 items-center">
                <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                  Indirect Population Coverage:
                </strong>
                <CoverageBadge value={inc.indirectPopulationCoverageScore} />
              </div>
              <div className="flex gap-1 items-center">
                <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                  # of Alerts:
                </strong>
                <span
                  className={`font-semibold ${
                    (inc._reports?.length ?? 0) > 0
                      ? "text-red-700 dark:text-red-300"
                      : "text-slate-500 dark:text-gray-400"
                  }`}
                >
                  {inc._reports?.length ?? 0}
                </span>
              </div>
              <div className="flex gap-1">
                <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                  Incident duration:
                </strong>
                {formatDurationFromSeconds(inc.incidentDurationSeconds)}
              </div>
              <div className="flex gap-1">
                <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                  Notes:
                </strong>
                {inc.notes ? (
                  <span className="whitespace-pre-line">{inc.notes}</span>
                ) : (
                  <span className="italic text-slate-500 dark:text-gray-400">
                    No notes recorded.
                  </span>
                )}
              </div>
              {inc.locationName && (
                <div className="flex gap-1 text-slate-600 dark:text-gray-300">
                  <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                    Location:
                  </strong>
                  {inc.locationName}
                </div>
              )}
            </div>

            {/* Divider: a vertical bar between the columns when side-by-side,
                a thin horizontal line once the ASN table wraps underneath. */}
            <div className="border-t min-[1456px]:border-t-0 min-[1456px]:border-l border-slate-300 dark:border-gray-600" />

            {/* Right (drops to the bottom when narrow): impacted ASN table.
                Equal flex-1 with the left column so the divider stays centered
                and the empty "No ASN Set" state keeps the same placement. */}
            <div className="min-[1456px]:flex-1 min-[1456px]:min-w-0">
              <strong className="text-teal-900 dark:text-teal-200">
                Impacted ASNs:
              </strong>
              <div className="mt-1">
                <ImpactedAsnTable asns={inc.impactedAsns ?? []} />
              </div>
            </div>
          </div>

          {/* Full-width alerts list, rendered like the incident detail page.
              Lazy-fetched per incident (only mounts when the row is expanded). */}
          <div className="w-full">
            <strong className="text-teal-900 dark:text-teal-200">
              Alerts ({inc._reports?.length ?? 0}):
            </strong>
            <div className="mt-1">
              <IncidentAlertsList groupId={inc._id} />
            </div>
          </div>
          </div>
        )}
      />

      <AggieDialog
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        className="px-3 py-4 w-full max-w-lg"
        data={{ title: "Edit Incident" }}
      >
        {editTarget && (
          <CreateEditIncidentForm
            group={editTarget}
            onCancel={() => setEditTarget(null)}
            onSubmit={(values) =>
              doUpdate.mutate(
                { ...values, _id: editTarget._id },
                { onSuccess: () => setEditTarget(null) },
              )
            }
            isLoading={doUpdate.isLoading}
          />
        )}
      </AggieDialog>

      <ConfirmationDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          doRemove.mutate(deleteTarget, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
        disabled={doRemove.isLoading}
        loading={doRemove.isLoading}
        title={`Delete incident ${deleteTarget?.title}?`}
        variant="danger"
        description="This action cannot be undone."
        className="max-w-md w-full"
        confirmText="Delete"
      >
        <p>
          There are {deleteTarget?._reports?.length ?? 0} report(s) attached,
          which will be permanently removed.
        </p>
      </ConfirmationDialog>
    </>
  );
};

export default IncidentsTable;
