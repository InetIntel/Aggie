import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faPencil,
  faTrash,
  faUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";

import type { Group } from "../../../api/groups/types";
import { useIncidentMutations } from "../useIncidentMutations";
import { IncidentOverallStatus } from "../IncidentStatuses";
import { CoverageBadge } from "../IncidentCoverage";
import ImpactedAsnTable from "../Incident/ImpactedAsnTable";
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

const IncidentsTable = ({ data, isLoading, selection }: IProps) => {
  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const { doUpdate, doRemove } = useIncidentMutations();
  const { formatDateTime } = useFormatters();

  const columns: DataTableColumn<Group>[] = [
    {
      id: "idnum",
      header: "ID#",
      thClassName: "w-12",
      tdClassName:
        "text-slate-600 dark:text-gray-400 font-medium whitespace-nowrap",
      cell: (inc) => <>#{inc.idnum}</>,
    },
    {
      id: "title",
      header: "Incident Title",
      thClassName: "pr-4",
      tdClassName: "pr-4 max-w-[22rem] [overflow-wrap:anywhere]",
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
          </>
        );
      },
    },
    {
      id: "date",
      header: "Date",
      bucket: "md",
      noSpillover: true,
      thClassName: "w-24",
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
      thClassName: "w-32",
      tdClassName: "whitespace-nowrap",
      cell: (inc) => (
        <IncidentOverallStatus
          group={inc}
          className="px-1.5 py-0.5 rounded-full font-medium text-xs text-slate-600 dark:text-gray-400 inline-flex gap-1 items-center no-underline w-fit"
        />
      ),
    },
    {
      id: "dpc",
      header: "DPC",
      bucket: "2xl",
      noSpillover: true,
      thClassName: "w-20",
      tdClassName: "whitespace-nowrap",
      cell: (inc) => (
        <CoverageBadge value={inc.directPopulationCoverageScore} />
      ),
    },
    {
      id: "ipc",
      header: "IPC",
      bucket: "2xl",
      noSpillover: true,
      thClassName: "w-20",
      tdClassName: "whitespace-nowrap",
      cell: (inc) => (
        <CoverageBadge value={inc.indirectPopulationCoverageScore} />
      ),
    },
    {
      id: "alertsReport",
      header: "# Of Alerts",
      bucket: "xl",
      noSpillover: true,
      thClassName: "w-28",
      cell: (inc) => <AlertsCount count={inc._reports?.length ?? 0} />,
    },
    {
      id: "assignedTo",
      header: "Assigned To",
      bucket: "xl",
      noSpillover: true,
      thClassName: "w-28",
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
          <div className="flex flex-col min-[1456px]:flex-row gap-y-4 gap-x-8 text-xs">
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
