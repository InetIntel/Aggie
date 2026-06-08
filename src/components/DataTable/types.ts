import type React from "react";

/**
 * Width below which a column is hidden in the table and instead surfaces in the
 * row's "More Info" panel. `undefined` means the column is always visible.
 *
 * Maps to Tailwind v3 breakpoints: a `bucket` of "lg" hides the cell below
 * 1024px (`hidden lg:table-cell`) and shows its spillover block below 1024px
 * (`lg:hidden`). One source of truth drives both, so the cell and its
 * spillover can never drift apart.
 */
export type ResponsiveBucket = "md" | "lg" | "xl";

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
}
