import type React from "react";

/**
 * Container width (px) at/above which a column shows in the row; below it the
 * column is hidden and instead surfaces in the row's "More Info" panel.
 * `undefined` means the column is always visible (never collapses).
 *
 * These are **container-query** thresholds measured against the DataTable's own
 * width (the `@container/dt` wrapper), not the viewport — so collapse tracks the
 * table's actual width even when a sidebar narrows it. Pick the value from the
 * ladder in `DataTable.tsx` nearest the cumulative min-width at which the column
 * stops fitting (i.e. the sum of the min-widths of everything shown at/above it,
 * including the pinned actions column). One value drives both the in-table cell
 * (`hidden @[Npx]/dt:table-cell`) and its spillover block (`@[Npx]/dt:hidden`),
 * so the two can never drift apart.
 */
export type CollapseStep =
  | 480 | 560 | 640 | 720 | 800 | 880 | 960 | 1040
  | 1120 | 1200 | 1280 | 1360 | 1440 | 1520 | 1600 | 1680;

export interface DataTableColumn<T> {
  id: string;
  /** Header label. When a string it doubles as the spillover `<dt>` label. */
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /**
   * Container width (px) below which this column collapses into "More Info".
   * Omit for an always-visible column. See {@link CollapseStep}.
   */
  collapseStep?: CollapseStep;
  /**
   * The column's minimum/target width in px. Under the table's fixed layout this
   * is applied as the `<th>` width basis (columns scale up to fill slack, so it
   * acts as a floor). Collapse thresholds are chosen so a column only appears
   * when there is room for it at this width.
   */
  minWidth?: number;
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
  /** Per-row actions, rendered in a trailing right-aligned Actions column. */
  rowActions?: (row: T) => React.ReactNode;
  /**
   * Width class for the Actions column. Under the table's fixed layout this
   * column needs a concrete width sized to its buttons (a `w-px`-style
   * shrink-to-content trick collapses to 1px). Set it to fit the widest action
   * set; may be responsive (e.g. `"w-24 xl:w-36"`). Defaults to `"w-16"`.
   */
  actionsColClassName?: string;
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
