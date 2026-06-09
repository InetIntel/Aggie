import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";

import type { Group } from "../../../api/groups/types";
import { useIncidentMutations } from "../useIncidentMutations";
import { statusFromGroup, IncidentTableStatus } from "./statusFromGroup";
import AsnChips from "./AsnChips";

import DataTable from "../../../components/DataTable/DataTable";
import type { DataTableColumn } from "../../../components/DataTable/types";
import AggieDialog from "../../../components/AggieDialog";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import CreateEditIncidentForm from "../CreateEditIncidentForm";

interface IProps {
  data: Group[];
  isLoading?: boolean;
}

const statusClass: Record<IncidentTableStatus, string> = {
  Open: "text-slate-700 dark:text-gray-300",
  Closed: "text-slate-700 dark:text-gray-300",
  "In Progress": "text-blue-700 font-medium dark:text-blue-300",
};

const formatStartDate = (raw?: Date | string | null) => {
  if (!raw) return { date: "—", time: "" };
  const s = raw.toString();
  const trimmed = s.slice(0, 16).replace("T", " ");
  const [date, time] = trimmed.split(" ");
  return { date: date || "—", time: time || "" };
};

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
      <span className='ml-1 text-[12px] text-slate-500 dark:text-gray-400'>
        alerts
      </span>
    )}
  </>
);

const IncidentsTable = ({ data, isLoading }: IProps) => {
  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const { doUpdate, doRemove } = useIncidentMutations();

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
      tdClassName: "pr-4",
      cell: (inc) => {
        const reportCount = inc._reports?.length ?? 0;
        return (
          <>
            <Link
              to={`/incidents/${inc._id}`}
              className='text-blue-700 hover:underline font-medium dark:text-blue-300 leading-snug'
              onClick={(e) => e.stopPropagation()}
            >
              {inc.title}
            </Link>
            <div className='text-[18px] text-slate-500 dark:text-gray-400 mt-0.5'>
              {reportCount} {reportCount === 1 ? "report" : "reports"}
            </div>
          </>
        );
      },
    },
    {
      id: "startDate",
      header: "Start Date",
      bucket: "md",
      thClassName: "w-24",
      tdClassName: "whitespace-nowrap text-[18px]",
      cell: (inc) => {
        const { date, time } = formatStartDate(inc.incidentStartedAt);
        return (
          <>
            <div>{date}</div>
            {time && (
              <div className='text-[18px] text-slate-500 dark:text-gray-400 mt-0.5'>
                {time}
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      thClassName: "w-24",
      tdClassName: "whitespace-nowrap",
      cell: (inc) => {
        const status = statusFromGroup(inc);
        return <span className={statusClass[status]}>{status}</span>;
      },
    },
    {
      id: "alertsReport",
      header: "Alerts Report",
      bucket: "xl",
      thClassName: "w-28",
      cell: (inc) => <AlertsCount count={inc._reports?.length ?? 0} />,
    },
    {
      id: "asns",
      header: "ASNs Impacted",
      bucket: "lg",
      thClassName: "w-40",
      cell: (inc) =>
        inc.impactedAsns && inc.impactedAsns.length > 0 ? (
          <AsnChips asns={inc.impactedAsns} max={20} />
        ) : (
          <AsnChips asns={inc.impactedAsns} />
        ),
    },
    {
      id: "assignedTo",
      header: "Assigned To",
      bucket: "xl",
      thClassName: "w-28",
      cell: (inc) =>
        formatAssignedTo(inc) || (
          <span className='text-slate-500 dark:text-gray-400'>—</span>
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
        rowActions={(inc) => (
          <div className='inline-flex items-center gap-2'>
            <button
              type='button'
              aria-label={`Edit incident ${inc.idnum}`}
              onClick={() => setEditTarget(inc)}
              className='text-green-800 hover:text-green-700 dark:text-green-300 dark:hover:text-green-200 transition-colors p-1'
            >
              <FontAwesomeIcon icon={faPencil} />
            </button>
            <button
              type='button'
              aria-label={`Delete incident ${inc.idnum}`}
              onClick={() => setDeleteTarget(inc)}
              className='text-slate-600 hover:text-red-700 dark:text-gray-400 dark:hover:text-red-300 transition-colors p-1'
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        )}
        expandedContent={(inc) => (
          <>
            <div>
              <strong className='text-teal-900 dark:text-teal-200'>
                Notes:{" "}
              </strong>
              {inc.notes ? (
                <span className='whitespace-pre-line'>{inc.notes}</span>
              ) : (
                <span className='italic text-slate-500 dark:text-gray-400'>
                  No notes recorded.
                </span>
              )}
            </div>
            {inc.locationName && (
              <div className='mt-1 text-slate-600 dark:text-gray-300'>
                <strong className='text-teal-900 dark:text-teal-200'>
                  Location:{" "}
                </strong>
                {inc.locationName}
              </div>
            )}
          </>
        )}
      />

      <AggieDialog
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        className='px-3 py-4 w-full max-w-lg'
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
        variant='danger'
        description='This action cannot be undone.'
        className='max-w-md w-full'
        confirmText='Delete'
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
