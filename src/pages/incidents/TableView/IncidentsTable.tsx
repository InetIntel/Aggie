import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import type { Group } from "../../../api/groups/types";
import { useIncidentMutations } from "../useIncidentMutations";
import { statusFromGroup, IncidentTableStatus } from "./statusFromGroup";
import AsnChips from "./AsnChips";

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

const IncidentsTable = ({ data, isLoading }: IProps) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const { doUpdate, doRemove } = useIncidentMutations();

  if (!isLoading && (!data || data.length === 0)) {
    return (
      <div className='border border-slate-300 rounded-lg bg-white dark:bg-gray-800 w-full py-12 grid place-items-center font-medium'>
        <p>No Results Found</p>
      </div>
    );
  }

  return (
    <>
      <div className='border border-slate-300 rounded-lg bg-white dark:bg-gray-800'>
        <table className='w-full text-sm text-slate-700 dark:text-gray-300'>
          <thead>
            <tr className='border-b-2 border-slate-300 bg-white dark:bg-gray-800'>
              <th scope='col' className='w-12 px-2 py-2 text-left font-semibold whitespace-nowrap'>
                ID#
              </th>
              <th scope='col' className='px-2 pr-4 py-2 text-left font-semibold whitespace-nowrap'>
                Incident Title
              </th>
              <th scope='col' className='hidden md:table-cell w-24 px-2 py-2 text-left font-semibold whitespace-nowrap'>
                Start Date
              </th>
              <th scope='col' className='w-24 px-2 py-2 text-left font-semibold'>
                Status
              </th>
              <th scope='col' className='hidden xl:table-cell w-28 px-2 py-2 text-left font-semibold whitespace-nowrap'>
                Alerts Report
              </th>
              <th scope='col' className='hidden lg:table-cell w-40 px-2 py-2 text-left font-semibold whitespace-nowrap'>
                ASNs Impacted
              </th>
              <th scope='col' className='hidden xl:table-cell w-28 px-2 py-2 text-left font-semibold whitespace-nowrap'>
                Assigned To
              </th>
              <th scope='col' className='w-20 px-2 py-2 text-left font-semibold whitespace-nowrap'>
                More Info
              </th>
              <th scope='col' className='w-16 px-2 py-2'>
                <span className='sr-only'>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (!data || data.length === 0) && (
              <tr>
                <td colSpan={9} className='px-4 py-12 text-center text-slate-500 dark:text-gray-400'>
                  Loading data...
                </td>
              </tr>
            )}
            {data.map((inc) => {
              const isExpanded = expandedRow === inc._id;
              const status = statusFromGroup(inc);
              const { date, time } = formatStartDate(inc.incidentStartedAt);
              const reportCount = inc._reports?.length ?? 0;
              const assigned = formatAssignedTo(inc);

              return (
                <Fragment key={inc._id}>
                  <tr className='border-b border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-colors'>
                    <td className='px-2 py-2 text-slate-600 dark:text-gray-400 font-medium whitespace-nowrap'>
                      #{inc.idnum}
                    </td>

                    <td className='px-2 pr-4 py-2 align-top'>
                      <Link
                        to={`/incidents/${inc._id}`}
                        className='text-blue-700 hover:underline font-medium dark:text-blue-300 leading-snug'
                      >
                        {inc.title}
                      </Link>
                      <div className='text-[12px] text-slate-500 dark:text-gray-400 mt-0.5'>
                        {reportCount} {reportCount === 1 ? "report" : "reports"}
                      </div>
                    </td>

                    <td className='hidden md:table-cell px-2 py-2 whitespace-nowrap text-[13px]'>
                      <div>{date}</div>
                      {time && (
                        <div className='text-[12px] text-slate-500 dark:text-gray-400 mt-0.5'>
                          {time}
                        </div>
                      )}
                    </td>

                    <td className={`px-2 py-2 whitespace-nowrap ${statusClass[status]}`}>{status}</td>

                    <td className='hidden xl:table-cell px-2 py-2'>
                      <span
                        className={`font-semibold ${
                          reportCount > 0
                            ? "text-red-700 dark:text-red-300"
                            : "text-slate-500 dark:text-gray-400"
                        }`}
                      >
                        {reportCount}
                      </span>
                      {reportCount > 0 && (
                        <span className='ml-1 text-[12px] text-slate-500 dark:text-gray-400'>
                          alerts
                        </span>
                      )}
                    </td>

                    <td className='hidden lg:table-cell px-2 py-2'>
                      <AsnChips asns={inc.impactedAsns} />
                    </td>

                    <td className='hidden xl:table-cell px-2 py-2'>
                      {assigned || (
                        <span className='text-slate-500 dark:text-gray-400'>—</span>
                      )}
                    </td>

                    <td className='px-2 py-2 whitespace-nowrap'>
                      <button
                        type='button'
                        onClick={() => setExpandedRow(isExpanded ? null : inc._id)}
                        aria-expanded={isExpanded}
                        aria-controls={`detail-${inc._id}`}
                        className='text-blue-700 hover:underline text-sm inline-flex items-center gap-1 dark:text-blue-300'
                      >
                        {isExpanded ? "Hide" : "View"}
                        <FontAwesomeIcon
                          icon={faChevronDown}
                          size='sm'
                          className={`transition-transform duration-150 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </td>

                    <td className='px-2 py-2 whitespace-nowrap text-right'>
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
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr
                      id={`detail-${inc._id}`}
                      className='bg-teal-50 border-b border-teal-200 dark:bg-gray-700/40 dark:border-gray-600'
                    >
                      <td colSpan={9} className='px-4 py-3 text-sm text-slate-700 dark:text-gray-200'>
                        {/* Fields mirroring columns hidden at the current breakpoint.
                            Each block uses the *inverse* responsive class of its column.
                            The whole <dl> is hidden at xl+ since every column is already
                            in the row at that width — no point rendering empty margin. */}
                        <dl className='flex flex-col gap-2 mb-3 xl:hidden'>
                          <div className='md:hidden'>
                            <dt className='font-semibold text-teal-900 dark:text-teal-200'>Start Date</dt>
                            <dd>{date}{time && ` ${time}`}</dd>
                          </div>
                          <div className='lg:hidden'>
                            <dt className='font-semibold text-teal-900 dark:text-teal-200'>ASNs Impacted</dt>
                            <dd>
                              {inc.impactedAsns && inc.impactedAsns.length > 0 ? (
                                <AsnChips asns={inc.impactedAsns} max={20} />
                              ) : (
                                <span className='text-slate-500 dark:text-gray-400'>—</span>
                              )}
                            </dd>
                          </div>
                          <div className='xl:hidden'>
                            <dt className='font-semibold text-teal-900 dark:text-teal-200'>Alerts Report</dt>
                            <dd>
                              <span
                                className={`font-semibold ${
                                  reportCount > 0
                                    ? "text-red-700 dark:text-red-300"
                                    : "text-slate-500 dark:text-gray-400"
                                }`}
                              >
                                {reportCount}
                              </span>
                              {reportCount > 0 && (
                                <span className='ml-1 text-[12px] text-slate-500 dark:text-gray-400'>
                                  alerts
                                </span>
                              )}
                            </dd>
                          </div>
                          <div className='xl:hidden'>
                            <dt className='font-semibold text-teal-900 dark:text-teal-200'>Assigned To</dt>
                            <dd>
                              {assigned || (
                                <span className='text-slate-500 dark:text-gray-400'>—</span>
                              )}
                            </dd>
                          </div>
                        </dl>

                        <div>
                          <strong className='text-teal-900 dark:text-teal-200'>Notes: </strong>
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
                            <strong className='text-teal-900 dark:text-teal-200'>Location: </strong>
                            {inc.locationName}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

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
                { onSuccess: () => setEditTarget(null) }
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
          There are {deleteTarget?._reports?.length ?? 0} report(s) attached, which will be
          permanently removed.
        </p>
      </ConfirmationDialog>
    </>
  );
};

export default IncidentsTable;
