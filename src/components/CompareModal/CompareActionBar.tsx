import AggieButton from "../AggieButton";
import CompareIcon from "../icons/CompareIcon";

interface IProps {
  /** Number of rows currently checked for comparison. */
  count: number;
  /** Singular noun for the item type, e.g. "alert" / "incident". */
  noun: string;
  /** Launch the comparison modal (enabled at >= 2). */
  onCompare: () => void;
  /** Empty the selection without leaving compare mode. */
  onClear: () => void;
}

// Floating bottom bar shown while compare-select mode is on and at least one row
// is checked. It separates *launching* the comparison (this bar's primary CTA)
// from *entering* select mode (the toolbar Compare toggle) — the two used to
// share the "Compare" label in the toolbar and were easy to confuse.
const CompareActionBar = ({ count, noun, onCompare, onClear }: IProps) => (
  <div className='fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg'>
    <span className='text-sm font-medium whitespace-nowrap'>
      {count} selected
    </span>
    <AggieButton
      variant='primary'
      className='px-3 py-1.5 text-sm'
      disabled={count < 2}
      onClick={onCompare}
    >
      <CompareIcon className='w-4 h-4' />
      Compare {count} {noun}
      {count === 1 ? "" : "s"}
    </AggieButton>
    <AggieButton
      variant='secondary'
      className='px-3 py-1.5 text-sm'
      onClick={onClear}
    >
      Clear
    </AggieButton>
  </div>
);

export default CompareActionBar;
