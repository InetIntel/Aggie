import type React from "react";

export interface DataTableColumn<T> {
  id: string;
  /** Header label. When a string it doubles as the spillover `<dt>` label. */
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /**
   * Collapse priority. Lower = more persistent (collapses later); columns with a
   * `collapsePriority` drop into "More Info" as the table narrows, in descending
   * priority order. Omit for an always-visible column that never collapses.
   *
   * DataTable measures its own width and keeps the highest-priority columns whose
   * `minWidth`s (plus the checkbox and actions columns) still fit, so collapse
   * tracks the table's real width — including the dynamic select column, which a
   * pure-CSS breakpoint could not account for. The numeric value only sets order;
   * spacing between values is irrelevant.
   */
  collapsePriority?: number;
  /**
   * The column's minimum/target width in px, applied as the `<th>` width basis.
   * DataTable computes each visible column's width from the measured table width:
   * columns sit at `minWidth`, the `grow` column absorbs the leftover so the table
   * fills exactly (no trailing gap), and if the visible set is too wide (narrow
   * mobile) every width is scaled down so the table still never overflows.
   */
  minWidth?: number;
  /**
   * Mark the one column that should absorb leftover width so the row fills the
   * table exactly (others stay at `minWidth`). Without a `grow` column a narrow
   * set would leave empty space on the right. One per table (the flexible column,
   * e.g. the incident title).
   */
  grow?: boolean;
  /** Extra classes on the `<th>` (alignment, etc.). */
  thClassName?: string;
  /** Extra classes on the `<td>`. */
  tdClassName?: string;
  /** Override the `<dt>` label used in the "More Info" spillover panel. */
  spilloverLabel?: string;
  /** Omit this column from the "More Info" panel even when it is hidden. */
  noSpillover?: boolean;
}

export interface DataTableSelection<T> {
  isActive: boolean;
  isChecked: (row: T) => boolean;
  onToggle: (row: T) => void;
  /**
   * Keep the checkbox column visible even when `isActive` is false. Idle
   * checkboxes reveal on row hover (or when the row is checked); clicking one is
   * what flips selection on. Mirrors the list view's hover checkbox. Defaults to
   * off (column only appears once selection is active).
   */
  alwaysShow?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: React.ReactNode;
  /**
   * Per-row actions, rendered in a single pinned trailing column together with
   * the expand caret (when `hideExpandBar` is set). Always visible.
   */
  rowActions?: (row: T) => React.ReactNode;
  /**
   * Width (px) of the pinned actions/caret column. Sized to fit the widest action
   * set plus the caret (its content is not clipped, so an undersized value lets
   * buttons spill past the table edge). Also reserved by the column measurer so
   * data columns collapse before crowding it. Defaults to 96.
   */
  actionsColWidth?: number;
  /**
   * Extra detail rendered in the expanded row, below the auto-generated
   * spillover blocks for hidden columns (e.g. notes, tags, url).
   */
  expandedContent?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  /** Optional leading checkbox column for multi-select. */
  selection?: DataTableSelection<T>;
  /**
   * Hide the centered "View details / Hide details" toggle bar under each row.
   * Rows still expand/collapse on row click; a far-right caret cell indicates
   * (and toggles) each expandable row's open/closed state instead. Defaults to
   * showing the bar.
   */
  hideExpandBar?: boolean;
  /**
   * When true, an expanded row and its detail panel render as a single
   * "connected" card: a shared background + left accent border spanning both,
   * with the divider between them removed. Opt-in so tables that already style
   * their expanded row (e.g. alerts) are unaffected. Defaults to off.
   */
  connectedExpanded?: boolean;
  /**
   * Extra classes on the `<table>` — e.g. a smaller base text size (`text-xs`)
   * so a column-heavy table fits the page width. Defaults to the table's
   * `text-sm`.
   */
  tableClassName?: string;
}
