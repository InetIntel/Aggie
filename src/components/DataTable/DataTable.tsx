import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

import AggieCheck from "../AggieCheck";
import type { DataTableColumn, DataTableProps, ResponsiveBucket } from "./types";

// bucket → classes for the in-table cell (hidden below the breakpoint) and the
// "More Info" spillover block (shown only below the breakpoint). One bucket
// drives both so they can never disagree.
const HIDDEN_CELL: Record<ResponsiveBucket, string> = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};
const SPILLOVER_BLOCK: Record<ResponsiveBucket, string> = {
  md: "md:hidden",
  lg: "lg:hidden",
  xl: "xl:hidden",
};

function spilloverColumns<T>(columns: DataTableColumn<T>[]) {
  return columns.filter((c) => c.bucket && !c.noSpillover);
}

// Header cells stay pinned to the top of the (vertically scrollable) table card.
// The bottom divider is an inset box-shadow rather than a border: cell borders
// don't travel with a sticky cell, but box-shadows do. Background keeps rows
// from bleeding through.
const STICKY_TH =
  "sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-[inset_0_-2px_0_0_#94a3b8] dark:shadow-[inset_0_-2px_0_0_#6b7280]";

function DataTable<T>({
  data,
  columns,
  getRowKey,
  isLoading,
  emptyMessage = "No Results Found",
  rowActions,
  expandedContent,
  onRowClick,
  rowClassName,
  selection,
}: DataTableProps<T>) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const hasSpillover = spilloverColumns(columns).length > 0;
  const hasExpandable = hasSpillover || !!expandedContent;
  const showSelect = !!selection?.isActive;
  const actionsCol = !!rowActions;

  const totalCols =
    (showSelect ? 1 : 0) + columns.length + (actionsCol ? 1 : 0);
  const isEmpty = !data || data.length === 0;

  return (
    <div className='border border-slate-300 rounded-lg bg-white dark:bg-gray-800 overflow-auto max-h-[75vh]'>
      <table className='w-full text-sm text-slate-700 dark:text-gray-300'>
        <thead>
          <tr>
            {showSelect && (
              <th scope='col' className={`w-8 px-2 py-2 ${STICKY_TH}`}>
                <span className='sr-only'>Select</span>
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.id}
                scope='col'
                className={`px-2 py-2 text-left font-semibold whitespace-nowrap ${STICKY_TH} ${
                  col.bucket ? HIDDEN_CELL[col.bucket] : ""
                } ${col.thClassName ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            {actionsCol && (
              <th scope='col' className={`w-px px-2 py-2 text-right ${STICKY_TH}`}>
                <span className='sr-only'>Actions</span>
              </th>
            )}
          </tr>
        </thead>

        {isEmpty && (
          <tbody>
            <tr>
              <td
                colSpan={totalCols}
                className='px-4 py-12 text-center text-slate-500 dark:text-gray-400 font-medium'
              >
                {isLoading ? "Loading data..." : emptyMessage}
              </td>
            </tr>
          </tbody>
        )}

        {data.map((row, i) => {
          const key = getRowKey(row);
          const isExpanded = expandedRow === key;
          const striped = i % 2 === 1;

          // Each logical row is its own <tbody> so the data row, the action bar,
          // and the expanded detail group together and hover as a unit.
          return (
            <tbody
              key={key}
              className={`border-b border-slate-200 dark:border-gray-700 transition-colors ${
                striped ? "bg-slate-100 dark:bg-gray-700/40" : ""
              } hover:bg-aggie-teal-10 dark:hover:bg-aggie-teal-10/10 ${
                rowClassName?.(row) ?? ""
              }`}
            >
              <tr
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {showSelect && (
                  <td
                    className='px-2 pt-2 align-top'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AggieCheck
                      active={selection!.isChecked(row)}
                      onClick={() => selection!.onToggle(row)}
                    />
                  </td>
                )}

                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={`px-2 pt-2 align-top ${
                      col.bucket ? HIDDEN_CELL[col.bucket] : ""
                    } ${col.tdClassName ?? ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}

                {actionsCol && (
                  <td
                    className='px-2 pt-2 align-top text-right whitespace-nowrap'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowActions!(row)}
                  </td>
                )}
              </tr>

              {hasExpandable && (
                <tr>
                  <td colSpan={totalCols} className='px-2 py-0.5'>

                    {/* Full-width bar: centered More toggle, on its own band. */}
                    <div className='flex items-center justify-center'>
                      <button
                        type='button'
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRow(isExpanded ? null : key);
                        }}
                        aria-expanded={isExpanded}
                        aria-controls={`detail-${key}`}
                        className='text-blue-700 hover:underline text-xs inline-flex items-center gap-1 font-medium dark:text-blue-300'
                      >
                        {isExpanded ? "Hide details" : "View details"}
                        <FontAwesomeIcon
                          icon={faChevronDown}
                          size='sm'
                          className={`transition-transform duration-150 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {isExpanded && hasExpandable && (
                <tr id={`detail-${key}`}>
                  <td
                    colSpan={totalCols}
                    className='px-4 py-3 text-sm text-slate-700 dark:text-gray-200 bg-teal-50 dark:bg-gray-700/40 border-t border-teal-200 dark:border-gray-600'
                  >
                    {/* Auto-generated spillover: each hidden column renders here
                        under its inverse responsive class, so at the widest
                        breakpoint (where nothing is hidden) the whole list
                        collapses away. */}
                    {hasSpillover && (
                      <dl className='flex flex-col gap-2 mb-3'>
                        {spilloverColumns(columns).map((col) => (
                          <div
                            key={col.id}
                            className={SPILLOVER_BLOCK[col.bucket!]}
                          >
                            <dt className='font-semibold text-teal-900 dark:text-teal-200'>
                              {col.spilloverLabel ??
                                (typeof col.header === "string"
                                  ? col.header
                                  : col.id)}
                            </dt>
                            <dd>{col.cell(row)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {expandedContent?.(row)}
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export default DataTable;
