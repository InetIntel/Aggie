import AggieButton from "../AggieButton";
import CompareIcon from "../icons/CompareIcon";

interface IProps {
  /** Whether compare-select mode is on. */
  active: boolean;
  /** Number of rows currently checked for comparison. */
  count: number;
  /** Singular noun for the item type, e.g. "alert" / "incident". */
  noun: string;
  /** Enter/exit compare-select mode. */
  onToggle: () => void;
  /** Launch the comparison modal (enabled at >= 2). */
  onCompare: () => void;
  /** Empty the selection without leaving compare mode. */
  onClear: () => void;
}

// Inline compare control that lives in the toolbar, just after the list/table
// view toggle (a divider separates the two). When idle it's a single "Compare"
// toggle; once active it turns blue like the active view toggle and becomes the
// action bar itself — launch (primary CTA), clear, and cancel — replacing the
// old floating bottom bar.
const CompareToolbar = ({
  active,
  count,
  noun,
  onToggle,
  onCompare,
  onClear,
}: IProps) => (
  <div className='inline-flex items-center gap-2'>
    {/* Divider between the view toggle and the compare controls. */}
    <div
      aria-hidden='true'
      className='h-6 w-px bg-slate-300 dark:bg-gray-600'
    />
    {!active ? (
      <AggieButton
        className='px-3 py-1 text-sm rounded-lg border bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700'
        aria-pressed={false}
        onClick={onToggle}
      >
        <CompareIcon className='w-4 h-4' />
        Compare
      </AggieButton>
    ) : (
      <>
        <AggieButton
          className='px-3 py-1 text-sm rounded-lg border border-aggie-secondary-500 bg-aggie-secondary-500 text-white hover:bg-aggie-secondary-500/90'
          disabled={count < 2}
          onClick={onCompare}
          title={count < 2 ? `Select at least 2 ${noun}s to compare` : undefined}
        >
          <CompareIcon className='w-4 h-4' />
          {count === 0
            ? "Compare"
            : `Compare ${count} ${noun}${count === 1 ? "" : "s"}`}
        </AggieButton>
        {count >= 1 && (
          <AggieButton
            variant='secondary'
            className='px-2 py-1 text-sm'
            onClick={onClear}
          >
            Clear
          </AggieButton>
        )}
        <AggieButton
          variant='secondary'
          className='px-2 py-1 text-sm'
          onClick={onToggle}
        >
          Cancel
        </AggieButton>
      </>
    )}
  </div>
);

export default CompareToolbar;
