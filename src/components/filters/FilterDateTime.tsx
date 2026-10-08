import { FloatingTree } from "@floating-ui/react";
import { useRef, useState, type CSSProperties } from "react";
import { DayPicker, getDefaultClassNames, type DateRange } from "react-day-picker";
import AggieButton from "../AggieButton";
import FilterDropdown from "./FilterDropdown";
import { useFormatters } from "../../utils/useFormatters";

interface IProps {
  before: string;
  onSetBefore: (item: string) => void;
  after: string;
  onSetAfter: (item: string) => void;
  label?: string;
  earliest?: Date;
}

// Dates are whole days in the browser's time zone: the range runs from the
// start of the first day to the end of the last day, so the end date is inclusive.
// The end never goes past the current time, so picking today means "up to now".
const startOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate());
const endOfDay = (day: Date) => {
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  const now = new Date();
  return end > now ? now : end;
};

/** Date -> "YYYY-MM-DD" (the format `<input type="date">` uses). */
function toInputValue(day?: Date) {
  if (!day) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** "YYYY-MM-DD" -> local Date, or undefined while the input is incomplete. */
function fromInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(day.getTime()) ? undefined : day;
}

interface IPanelProps {
  before: string;
  after: string;
  onApply: (after: string, before: string) => void;
  onCancel: () => void;
  /** first selectable day; defaults to no lower bound */
  earliest?: Date;
}

// The date range panel on its own, so it can be shown inside other menus
// (e.g. the Reports "Filter" menu). It mounts fresh each time it opens, so its
// draft state always starts from the applied values.
export const DateRangePanel = ({ before, after, onApply, onCancel, earliest }: IPanelProps) => {
  const [today] = useState(() => startOfDay(new Date()));
  const [range, setRange] = useState<DateRange | undefined>(() =>
    after ? { from: startOfDay(new Date(after)), to: before ? startOfDay(new Date(before)) : undefined } : undefined
  );
  // The date inputs are uncontrolled: while a date is half-typed the input's
  // value is "", and a controlled value would wipe the typed segments on the
  // next re-render. Only complete dates (or "") are mirrored here.
  const [startText, setStartText] = useState(toInputValue(range?.from));
  const [endText, setEndText] = useState(toInputValue(range?.to));
  const inputRefs = { from: useRef<HTMLInputElement>(null), to: useRef<HTMLInputElement>(null) };
  const [month, setMonth] = useState(range?.from ?? today);
  const classes = getDefaultClassNames();

  const outOfBounds = (day?: Date) => !!day && (day > today || (!!earliest && day < earliest));
  const startTyped = fromInputValue(startText);
  const endTyped = fromInputValue(endText);
  const error =
    outOfBounds(startTyped) || outOfBounds(endTyped)
        ? earliest
          ? `Dates must be between ${earliest.toLocaleDateString()} and ${today.toLocaleDateString()}.`
          : `Dates can't be after ${today.toLocaleDateString()}.`
        : startTyped && endTyped && startTyped > endTyped ? "End date must be on or after start date."
          : "";

  function selectRange(next?: DateRange) {
    setRange(next);
    setStartText(toInputValue(next?.from));
    setEndText(toInputValue(next?.to));
    // Picking on the calendar writes the dates into the inputs.
    if (inputRefs.from.current) inputRefs.from.current.value = toInputValue(next?.from);
    if (inputRefs.to.current) inputRefs.to.current.value = toInputValue(next?.to);
  }

  function typeDate(which: "from" | "to", value: string) {
    (which === "from" ? setStartText : setEndText)(value);
    const day = fromInputValue(value);
    if (!day || outOfBounds(day)) return;
    setRange((current) => ({ from: current?.from, to: current?.to, [which]: day }) as DateRange);
    setMonth(day);
  }

  const inputs = [
    { id: "from" as const, label: "Start date", initial: toInputValue(range?.from) },
    { id: "to" as const, label: "End date", initial: toInputValue(range?.to) },
  ];

  return (
    <div className='max-h-[70vh] overflow-auto p-4 text-sm bg-white text-slate-900 dark:bg-gray-800 dark:text-gray-100'>
      <div className='grid grid-cols-2 gap-3'>
        {inputs.map((input) => (
          <label key={input.id} className='block'>
            <span className='block mb-1 text-xs font-medium text-slate-600 dark:text-gray-300'>{input.label}</span>
            <input
              type='date'
              ref={inputRefs[input.id]}
              defaultValue={input.initial}
              min={earliest ? toInputValue(earliest) : undefined}
              max={toInputValue(today)}
              onChange={(event) => typeDate(input.id, event.target.value)}
              className='block w-full px-2 py-1.5 rounded-md border border-slate-300 bg-white dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-aggie-secondary-500 focus:border-aggie-secondary-500'
            />
          </label>
        ))}
      </div>
      {error && <p role='alert' className='mt-2 text-xs text-red-700 dark:text-red-400'>{error}</p>}
      <DayPicker
        mode='range'
        captionLayout='dropdown'
        navLayout='around'
        numberOfMonths={1}
        selected={range}
        onSelect={selectRange}
        month={month}
        onMonthChange={setMonth}
        startMonth={earliest}
        endMonth={today}
        disabled={[{ after: today }, ...(earliest ? [{ before: earliest }] : [])]}
        style={{
          "--rdp-accent-color": "#237F9E",
          "--rdp-accent-background-color": "#EAF6FA",
          "--rdp-range_middle-color": "#1A5E75",
          "--rdp-selected-border": "2px solid transparent",
        } as CSSProperties}
        classNames={{
          root: `${classes.root} relative mt-3 text-center bg-white dark:bg-gray-800 rounded p-2`,
          caption_label: `${classes.caption_label} text-sm font-semibold gap-1`,
          month_caption: `${classes.month_caption} justify-center`,
          chevron: `${classes.chevron} fill-aggie-secondary-500`,
          today: "font-bold underline",
          selected: `${classes.selected} font-semibold`,
          disabled: `${classes.disabled} opacity-40`,
          button_previous: `${classes.button_previous} rounded-full shadow-sm bg-white dark:bg-gray-700`,
          button_next: `${classes.button_next} rounded-full shadow-sm bg-white dark:bg-gray-700`,
        }}
      />
      <div className='flex justify-end gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-gray-700'>
        <AggieButton type='button' variant='secondary' padding='px-3 py-1' onClick={onCancel}>Cancel</AggieButton>
        <AggieButton
          type='button'
          variant='teal'
          padding='px-4 py-1'
          disabled={!!error || !range?.from || !range?.to}
          onClick={() => range?.from && range.to
            && onApply(startOfDay(range.from).toISOString(), endOfDay(range.to).toISOString())}
        >
          Done
        </AggieButton>
      </div>
    </div>
  );
};

const FilterDateTime = ({ before, onSetBefore, after, onSetAfter, label = "Date Range", earliest }: IProps) => {
  const { formatDate } = useFormatters();
  const rangeLabel = after && before ? `${formatDate(after)} - ${formatDate(before)}`
    : after ? `After ${formatDate(after)}` : before ? `Before ${formatDate(before)}` : "";

  return (
    <FloatingTree>
      <FilterDropdown
        label={label}
        persistLabel
        value={rangeLabel}
        panelClassName='w-max max-w-[calc(100vw-2rem)]'
        onReset={() => { onSetAfter(""); onSetBefore(""); }}
      >
        {({ close }) => (
          <DateRangePanel
            before={before}
            after={after}
            earliest={earliest}
            onCancel={close}
            onApply={(nextAfter, nextBefore) => { onSetBefore(nextBefore); onSetAfter(nextAfter); close(); }}
          />
        )}
      </FilterDropdown>
    </FloatingTree>
  );
};

export default FilterDateTime;
