import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

import AggieCheck from "../AggieCheck";
import { useMeasuredWidth } from "../../hooks/useMeasuredWidth";
import type { DataTableColumn, DataTableProps } from "./types";

// The checkbox column's on-screen width (w-8 + px-2 both sides). Reserved by the
// column-fit math so data columns collapse before crowding it.
const SELECT_COL_W = 48;
// Keep the computed columns a few px inside the measured width so borders and
// sub-pixel rounding can never tip the last column (the actions/caret group) past
// the container's right edge.
const FIT_SAFETY = 6;

interface FitResult {
  /** Column ids currently collapsed into "More Info". */
  hidden: Set<string>;
  /** Explicit px width for each column id (and the select/actions columns). */
  widths: Map<string, number>;
  selectWidth: number;
  actionsWidth: number;
}

// Decide which columns fit at the table's measured width, then hand back an
// explicit px width for every visible column. Columns with a `collapsePriority`
// collapse into "More Info" as the table narrows (highest priority = most
// persistent, dropped last); the rest always show. Because we measure the real
// width, the dynamic select column and the actions column are budgeted precisely
// — something a pure-CSS breakpoint could not do — so the table never overflows.
//
// Widths are computed (not left to the browser) so the visible columns always
// sum to exactly the container: the `grow` column absorbs any leftover, so the
// row fills the table even when a full-width `colSpan` detail row is present
// (which otherwise leaves the fixed columns short, floating the actions column).
function computeFit<T>(
  columns: DataTableColumn<T>[],
  containerWidth: number,
  selectW: number,
  actionsW: number
): FitResult {
  const hidden = new Set<string>();
  const widths = new Map<string, number>();
  const w = (c: DataTableColumn<T>) => c.minWidth ?? 0;
  const reserved = selectW + actionsW;

  // Before the first measurement, show everything at its base width.
  if (!containerWidth) {
    columns.forEach((c) => widths.set(c.id, w(c)));
    return { hidden, widths, selectWidth: selectW, actionsWidth: actionsW };
  }

  // Fit against a hair less than the true width so the table never touches (let
  // alone crosses) the container's right edge.
  const avail = containerWidth - FIT_SAFETY;

  const always = columns.filter((c) => c.collapsePriority == null);
  const collapsible = columns
    .filter((c) => c.collapsePriority != null)
    // Most persistent first (higher priority kept longer).
    .sort((a, b) => b.collapsePriority! - a.collapsePriority!);

  const visible = [...always];
  let used = reserved + always.reduce((s, c) => s + w(c), 0);
  let fits = true;
  for (const c of collapsible) {
    if (fits && used + w(c) <= avail) {
      used += w(c);
      visible.push(c);
    } else {
      fits = false;
      hidden.add(c.id);
    }
  }

  if (used > avail) {
    // Even the retained set is too wide (narrow phone): scale everything down so
    // the table fits instead of growing past its container.
    const scale = avail / used;
    visible.forEach((c) => widths.set(c.id, Math.max(1, Math.round(w(c) * scale))));
    return {
      hidden,
      widths,
      selectWidth: Math.max(1, Math.round(selectW * scale)),
      actionsWidth: Math.max(1, Math.round(actionsW * scale)),
    };
  }

  // Fits with slack: base widths, and the grow column absorbs the leftover so the
  // columns sum to exactly the available width (no trailing gap, no overflow).
  visible.forEach((c) => widths.set(c.id, w(c)));
  const growCol = visible.find((c) => c.grow);
  if (growCol) {
    const others =
      reserved +
      visible.reduce((s, c) => (c === growCol ? s : s + w(c)), 0);
    widths.set(growCol.id, Math.max(w(growCol), avail - others));
  }
  return { hidden, widths, selectWidth: selectW, actionsWidth: actionsW };
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
  actionsColWidth = 96,
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

  // Any column that can drop into "More Info" (has a priority and isn't excluded
  // from the panel). Static — governs whether rows are expandable at all.
  const hasCollapsible = columns.some(
    (c) => c.collapsePriority != null && !c.noSpillover
  );
  const hasExpandable = hasCollapsible || !!expandedContent;
  const showSelect = !!selection && (selection.isActive || !!selection.alwaysShow);
  const actionsCol = !!rowActions;
  // With the toggle bar hidden, a caret marks each expandable row's open/closed
  // state (rows still toggle on row click). The caret shares the single trailing
  // column with the row actions rather than getting its own column.
  const caretInGroup = hasExpandable && !!hideExpandBar;
  // One pinned trailing column holds the row actions and (when the toggle bar is
  // hidden) the caret, side by side.
  const trailingCol = actionsCol || caretInGroup;

  // Measure the table's own width and decide which columns fit (see computeFit).
  const { ref: wrapperRef, width: containerWidth } =
    useMeasuredWidth<HTMLDivElement>();
  const {
    hidden: hiddenIds,
    widths,
    selectWidth,
    actionsWidth,
  } = computeFit(
    columns,
    containerWidth,
    showSelect ? SELECT_COL_W : 0,
    trailingCol ? actionsColWidth : 0
  );
  const spilledColumns = columns.filter(
    (c) => hiddenIds.has(c.id) && !c.noSpillover
  );

  const totalCols =
    (showSelect ? 1 : 0) + columns.length + (trailingCol ? 1 : 0);
  const isEmpty = !data || data.length === 0;

  return (
    <div
      ref={wrapperRef}
      className='border border-slate-300 rounded-lg bg-white dark:bg-gray-800'
    >
      <table
        // `table-fixed` is the structural guarantee that the table can never be
        // wider than its container: widths come from the per-column `minWidth`
        // (applied as the `<th>` width basis) rather than from content, so a
        // column-heavy table fits the page instead of spilling off the right
        // edge. Which columns show, and a global down-scale on a too-narrow
        // container, are computed from the measured width (see computeFit).
        className={`w-full table-fixed text-slate-700 dark:text-gray-300 ${
          tableClassName ?? "text-sm"
        }`}
      >
        <thead>
          <tr>
            {showSelect && (
              <th
                scope='col'
                style={{ ...stickyTop, width: selectWidth }}
                className={`px-2 py-2 ${STICKY_TH}`}
              >
                <span className='sr-only'>Select</span>
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.id}
                scope='col'
                style={{ ...stickyTop, width: widths.get(col.id) }}
                className={`px-2 py-2 text-left font-semibold whitespace-nowrap overflow-hidden text-ellipsis ${STICKY_TH} ${
                  hiddenIds.has(col.id) ? "hidden" : ""
                } ${col.thClassName ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            {trailingCol && (
              <th
                scope='col'
                style={{ ...stickyTop, width: actionsWidth }}
                className={`px-2 py-2 text-right ${STICKY_TH}`}
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
                      hiddenIds.has(col.id) ? "hidden" : ""
                    } ${col.tdClassName ?? ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}

                {trailingCol && (
                  <td
                    className='px-2 pt-2 align-top text-right whitespace-nowrap'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* One pinned group: row actions plus (when the toggle bar
                        is hidden) the expand caret, side by side. A block `flex`
                        (not `inline-flex`) fills the cell and right-aligns the
                        group, so if the buttons are ever wider than the column
                        they overflow LEFT (into the clipped neighbor) and the
                        caret stays pinned at the cell's right edge — never
                        spilling past the table's right border. */}
                    <div className='flex items-center justify-end gap-1'>
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
                    {/* Auto-generated spillover: exactly the columns currently
                        hidden by the fit calculation render here as "Label:
                        value" lines. When the table is wide enough to show
                        everything, this list is empty. */}
                    {spilledColumns.length > 0 && (
                      <dl className='flex flex-col'>
                        {spilledColumns.map((col) => (
                          <div key={col.id} className='mb-1 flex gap-1'>
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
