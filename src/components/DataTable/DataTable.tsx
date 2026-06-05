import { Fragment, useState } from "react";
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
  actionsInMoreInfo,
}: DataTableProps<T>) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const hasSpillover = spilloverColumns(columns).length > 0;
  const hasExpandable = hasSpillover || !!expandedContent;
  const showSelect = !!selection?.isActive;
  // Actions either get their own trailing column, or fold into the More Info cell.
  const actionsInline = !!rowActions && !actionsInMoreInfo;
  const showMoreInfo =
    hasExpandable || (!!actionsInMoreInfo && !!rowActions);

  const totalCols =
    (showSelect ? 1 : 0) +
    columns.length +
    (showMoreInfo ? 1 : 0) +
    (actionsInline ? 1 : 0);

  const isEmpty = !data || data.length === 0;

  return (
    <div className='border border-slate-300 rounded-lg bg-white dark:bg-gray-800 overflow-x-auto'>
      <table className='w-full text-sm text-slate-700 dark:text-gray-300'>
        <thead>
          <tr className='border-b-2 border-slate-300 bg-white dark:bg-gray-800'>
            {showSelect && (
              <th scope='col' className='w-8 px-2 py-2'>
                <span className='sr-only'>Select</span>
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.id}
                scope='col'
                className={`px-2 py-2 text-left font-semibold whitespace-nowrap ${
                  col.bucket ? HIDDEN_CELL[col.bucket] : ""
                } ${col.thClassName ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            {showMoreInfo && (
              <th
                scope='col'
                className='w-20 px-2 py-2 text-left font-semibold whitespace-nowrap'
              >
                More Info
              </th>
            )}
            {actionsInline && (
              <th scope='col' className='w-16 px-2 py-2'>
                <span className='sr-only'>Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {isEmpty && (
            <tr>
              <td
                colSpan={totalCols}
                className='px-4 py-12 text-center text-slate-500 dark:text-gray-400 font-medium'
              >
                {isLoading ? "Loading data..." : emptyMessage}
              </td>
            </tr>
          )}
          {data.map((row) => {
            const key = getRowKey(row);
            const isExpanded = expandedRow === key;

            return (
              <Fragment key={key}>
                <tr
                  className={`border-b border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${rowClassName?.(row) ?? ""}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {showSelect && (
                    <td
                      className='px-2 py-2 align-top'
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
                      className={`px-2 py-2 align-top ${
                        col.bucket ? HIDDEN_CELL[col.bucket] : ""
                      } ${col.tdClassName ?? ""}`}
                    >
                      {col.cell(row)}
                    </td>
                  ))}

                  {showMoreInfo && (
                    <td
                      className='px-2 py-2 align-top'
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className='flex flex-col items-start gap-1.5'>
                        {actionsInMoreInfo && rowActions && (
                          <div>{rowActions(row)}</div>
                        )}
                        {hasExpandable && (
                          <button
                            type='button'
                            onClick={() =>
                              setExpandedRow(isExpanded ? null : key)
                            }
                            aria-expanded={isExpanded}
                            aria-controls={`detail-${key}`}
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
                        )}
                      </div>
                    </td>
                  )}

                  {actionsInline && (
                    <td
                      className='px-2 py-2 whitespace-nowrap text-right align-top'
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rowActions!(row)}
                    </td>
                  )}
                </tr>

                {isExpanded && hasExpandable && (
                  <tr
                    id={`detail-${key}`}
                    className='bg-teal-50 border-b border-teal-200 dark:bg-gray-700/40 dark:border-gray-600'
                  >
                    <td
                      colSpan={totalCols}
                      className='px-4 py-3 text-sm text-slate-700 dark:text-gray-200'
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
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
