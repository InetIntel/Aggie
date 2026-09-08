import type React from "react";

/**
 * Width below which a column is hidden in the table and instead surfaces in the
 * row's "More Info" panel. `undefined` means the column is always visible.
 *
 * Maps to Tailwind v3 breakpoints (md 768 / lg 1024 / xl 1280 / 2xl 1536): a
 * `bucket` of "lg" hides the cell below 1024px (`hidden lg:table-cell`) and
 * shows its spillover block below 1024px (`lg:hidden`). One source of truth
 * drives both, so the cell and its spillover can never drift apart.
 */
export type ResponsiveBucket = "md" | "lg" | "xl" | "2xl";

export interface DataTableColumn<T> {
  id: string;
  /** Header label. When a string it doubles as the spillover `<dt>` label. */
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Hide below this breakpoint and surface in "More Info" instead. */
  bucket?: ResponsiveBucket;
  /** Extra classes on the `<th>` (width hint, alignment). */
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
