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
  "2xl": "hidden 2xl:table-cell",
};
const SPILLOVER_BLOCK: Record<ResponsiveBucket, string> = {
  md: "md:hidden",
  lg: "lg:hidden",
  xl: "xl:hidden",
  "2xl": "2xl:hidden",
};

function spilloverColumns<T>(columns: DataTableColumn<T>[]) {
  return columns.filter((c) => c.bucket && !c.noSpillover);
}

// Header cells stay pinned as the page scrolls. The offset comes from the
// inheritable `--dt-sticky-top` CSS variable (default 0px) so a host page can
// park the header beneath its own sticky chrome — e.g. the alerts filters bar
// sets it to the bar's measured height. The bottom divider is an inset
// box-shadow rather than a border: cell borders don't travel with a sticky
// cell, but box-shadows do. Background keeps rows from bleeding through.
const STICKY_TH =
  "sticky z-10 bg-white dark:bg-gray-800 shadow-[inset_0_-2px_0_0_#94a3b8] dark:shadow-[inset_0_-2px_0_0_#6b7280]";
const stickyTop = { top: "var(--dt-sticky-top, 0px)" };

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
  hideExpandBar,
  connectedExpanded,
  tableClassName,
}: DataTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (key: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const hasSpillover = spilloverColumns(columns).length > 0;
  const hasExpandable = hasSpillover || !!expandedContent;
  const showSelect = !!selection?.isActive;
  const actionsCol = !!rowActions;
  // With the toggle bar hidden, a far-right caret marks each expandable row's
  // open/closed state (rows still toggle on row click).
  const caretCol = hasExpandable && !!hideExpandBar;

  const totalCols =
    (showSelect ? 1 : 0) +
    columns.length +
    (actionsCol ? 1 : 0) +
    (caretCol ? 1 : 0);
  const isEmpty = !data || data.length === 0;

  return (
    <div className='border border-slate-300 rounded-lg bg-white dark:bg-gray-800'>
      <table
        className={`w-full text-slate-700 dark:text-gray-300 ${
          tableClassName ?? "text-sm"
        }`}
      >
        <thead>
          <tr>
            {showSelect && (
              <th
                scope='col'
                style={stickyTop}
                className={`w-8 px-2 py-2 ${STICKY_TH}`}
              >
                <span className='sr-only'>Select</span>
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.id}
                scope='col'
                style={stickyTop}
                className={`px-2 py-2 text-left font-semibold whitespace-nowrap ${STICKY_TH} ${
                  col.bucket ? HIDDEN_CELL[col.bucket] : ""
                } ${col.thClassName ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            {actionsCol && (
              <th
                scope='col'
                style={stickyTop}
                className={`w-px px-2 py-2 text-right ${STICKY_TH}`}
              >
                <span className='sr-only'>Actions</span>
              </th>
            )}
            {caretCol && (
              <th
                scope='col'
                style={stickyTop}
                className={`w-px px-2 py-2 ${STICKY_TH}`}
              >
                <span className='sr-only'>Details</span>
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
          const isExpanded = expandedRows.has(key);
          const striped = i % 2 === 1;
          // Opt-in "connected card": the expanded row + its detail share one
          // background and a left accent, with no divider between them.
          const connected = !!connectedExpanded && isExpanded;
          // Clicking anywhere on the data row toggles the inline detail (same as
          // the "View details" button); onRowClick is still forwarded for any
          // future hook (e.g. a compare modal).
          const clickable = hasExpandable || !!onRowClick;

          // Each logical row is its own <tbody> so the data row, the action bar,
          // and the expanded detail group together and hover as a unit.
          return (
            <tbody
              key={key}
              className={`border-b border-slate-200 dark:border-gray-700 transition-colors ${
                connected
                  ? "bg-aggie-teal-10 dark:bg-aggie-teal-10/10 shadow-[inset_4px_0_0_0_#14b8a6] dark:shadow-[inset_4px_0_0_0_#2dd4bf]"
                  : `${
                      striped ? "bg-slate-100 dark:bg-gray-700/40" : ""
                    } hover:bg-aggie-teal-10 dark:hover:bg-aggie-teal-10/10`
              } ${rowClassName?.(row) ?? ""}`}
            >
              <tr
                className={clickable ? "cursor-pointer" : undefined}
                onClick={
                  clickable
                    ? () => {
                        if (hasExpandable) toggleRow(key);
                        onRowClick?.(row);
                      }
                    : undefined
                }
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
                    className='w-px px-2 pt-2 align-top text-right whitespace-nowrap'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowActions!(row)}
                  </td>
                )}

                {caretCol && (
                  <td className='px-2 pt-2 align-top text-right w-px'>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(key);
                      }}
                      aria-expanded={isExpanded}
                      aria-controls={`detail-${key}`}
                      aria-label={isExpanded ? "Hide details" : "View details"}
                      className='inline-flex items-center h-4 text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 px-1'
                    >
                      <FontAwesomeIcon
                        icon={faChevronDown}
                        className={`transition-transform duration-150 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </td>
                )}
              </tr>

              {hasExpandable && !hideExpandBar && (
                <tr>
                  <td colSpan={totalCols} className='px-2 py-0.5'>

                    {/* Full-width bar: the whole band toggles the detail; the
                        centered button is just the visible affordance. */}
                    <div
                      className='flex items-center justify-center cursor-pointer'
                      onClick={() => toggleRow(key)}
                    >
                      <button
                        type='button'
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(key);
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
                    className={`px-4 py-2 text-sm text-slate-700 dark:text-gray-200 overflow-x-auto ${
                      connected
                        ? // Keep the shared card background + accent, but mark
                          // the boundary between the row body and its detail.
                          "border-t border-slate-300 dark:border-gray-600"
                        : "bg-slate-50 dark:bg-gray-900/40 border-t border-slate-200 dark:border-gray-700"
                    }`}
                  >
                    {/* Auto-generated spillover: each hidden column renders here
                        under its inverse responsive class, so at the widest
                        breakpoint (where nothing is hidden) the whole list
                        collapses away. */}
                    {hasSpillover && (
                      <dl className='flex flex-col'>
                        {spilloverColumns(columns).map((col) => (
                          <div
                            key={col.id}
                            className={`${SPILLOVER_BLOCK[col.bucket!]} mb-1 flex gap-1`}
                          >
                            <dt className='font-semibold text-slate-700 dark:text-gray-300 shrink-0'>
                              {col.spilloverLabel ??
                                (typeof col.header === "string"
                                  ? col.header
                                  : col.id)}
                              :
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
