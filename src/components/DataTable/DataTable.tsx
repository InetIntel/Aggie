import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

import AggieCheck from "../AggieCheck";
import type { CollapseStep, DataTableColumn, DataTableProps } from "./types";

// collapseStep → classes for the in-table cell (hidden below the threshold) and
// the "More Info" spillover block (shown only below the threshold). One step
// drives both so they can never disagree. Thresholds are **container queries**
// against the `dt` container (the wrapper's `@container/dt`), so collapse tracks
// the table's own width, not the viewport.
//
// The class strings are LITERAL on purpose: Tailwind's JIT only generates a
// class it can see verbatim in the source, so a computed name such as
// `@[${n}px]/dt:table-cell` would silently emit no CSS. Keep every step spelled
// out here (this is also the ladder callers pick `collapseStep` values from).
const HIDDEN_CELL: Record<CollapseStep, string> = {
  480: "hidden @[480px]/dt:table-cell",
  560: "hidden @[560px]/dt:table-cell",
  640: "hidden @[640px]/dt:table-cell",
  720: "hidden @[720px]/dt:table-cell",
  800: "hidden @[800px]/dt:table-cell",
  880: "hidden @[880px]/dt:table-cell",
  960: "hidden @[960px]/dt:table-cell",
  1040: "hidden @[1040px]/dt:table-cell",
  1120: "hidden @[1120px]/dt:table-cell",
  1200: "hidden @[1200px]/dt:table-cell",
  1280: "hidden @[1280px]/dt:table-cell",
  1360: "hidden @[1360px]/dt:table-cell",
  1440: "hidden @[1440px]/dt:table-cell",
  1520: "hidden @[1520px]/dt:table-cell",
  1600: "hidden @[1600px]/dt:table-cell",
  1680: "hidden @[1680px]/dt:table-cell",
};
const SPILLOVER_BLOCK: Record<CollapseStep, string> = {
  480: "@[480px]/dt:hidden",
  560: "@[560px]/dt:hidden",
  640: "@[640px]/dt:hidden",
  720: "@[720px]/dt:hidden",
  800: "@[800px]/dt:hidden",
  880: "@[880px]/dt:hidden",
  960: "@[960px]/dt:hidden",
  1040: "@[1040px]/dt:hidden",
  1120: "@[1120px]/dt:hidden",
  1200: "@[1200px]/dt:hidden",
  1280: "@[1280px]/dt:hidden",
  1360: "@[1360px]/dt:hidden",
  1440: "@[1440px]/dt:hidden",
  1520: "@[1520px]/dt:hidden",
  1600: "@[1600px]/dt:hidden",
  1680: "@[1680px]/dt:hidden",
};

function spilloverColumns<T>(columns: DataTableColumn<T>[]) {
  return columns.filter((c) => c.collapseStep && !c.noSpillover);
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
  actionsColClassName = "w-16",
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
  const showSelect = !!selection && (selection.isActive || !!selection.alwaysShow);
  const actionsCol = !!rowActions;
  // With the toggle bar hidden, a caret marks each expandable row's open/closed
  // state (rows still toggle on row click). The caret shares the single trailing
  // column with the row actions rather than getting its own column.
  const caretInGroup = hasExpandable && !!hideExpandBar;
  // One pinned trailing column holds the row actions and (when the toggle bar is
  // hidden) the caret, side by side.
  const trailingCol = actionsCol || caretInGroup;

  const totalCols =
    (showSelect ? 1 : 0) + columns.length + (trailingCol ? 1 : 0);
  const isEmpty = !data || data.length === 0;

  return (
    // `@container/dt` makes this wrapper a named query container so columns can
    // collapse against the table's own width (see the collapseStep ladder), not
    // the viewport. `container-type: inline-size` is not a scroll container, so
    // it does not disturb the page-based sticky header.
    <div className='@container/dt border border-slate-300 rounded-lg bg-white dark:bg-gray-800'>
      <table
        // `table-fixed` is the structural guarantee that the table can never be
        // wider than its container: widths come from the per-column `minWidth`
        // (applied as the `<th>` width basis and scaled to fit) rather than from
        // content, so a column-heavy table fits the page instead of spilling off
        // the right edge. Cells clip/truncate their content (below) rather than
        // force the table wider.
        className={`w-full table-fixed text-slate-700 dark:text-gray-300 ${
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
                style={
                  col.minWidth
                    ? { ...stickyTop, width: col.minWidth, minWidth: col.minWidth }
                    : stickyTop
                }
                className={`px-2 py-2 text-left font-semibold whitespace-nowrap overflow-hidden text-ellipsis ${STICKY_TH} ${
                  col.collapseStep ? HIDDEN_CELL[col.collapseStep] : ""
                } ${col.thClassName ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            {trailingCol && (
              <th
                scope='col'
                style={stickyTop}
                className={`${actionsColClassName} px-2 py-2 text-right ${STICKY_TH}`}
              >
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
              className={`group border-b border-slate-200 dark:border-gray-700 transition-colors ${
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
                    <div
                      className={
                        selection!.isActive || selection!.isChecked(row)
                          ? ""
                          : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                      }
                    >
                      <AggieCheck
                        active={selection!.isChecked(row)}
                        onClick={() => selection!.onToggle(row)}
                      />
                    </div>
                  </td>
                )}

                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={`px-2 pt-2 align-top overflow-hidden ${
                      col.collapseStep ? HIDDEN_CELL[col.collapseStep] : ""
                    } ${col.tdClassName ?? ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}

                {trailingCol && (
                  <td
                    className={`${actionsColClassName} px-2 pt-2 align-top text-right whitespace-nowrap`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* One pinned group: row actions plus (when the toggle bar
                        is hidden) the expand caret, side by side. */}
                    <div className='inline-flex items-center justify-end gap-1'>
                      {actionsCol && rowActions!(row)}
                      {caretInGroup && (
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
                      )}
                    </div>
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
                            className={`${SPILLOVER_BLOCK[col.collapseStep!]} mb-1 flex gap-1`}
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
