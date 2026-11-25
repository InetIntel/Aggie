import {
  flip,
  FloatingPortal,
  useClick,
  useFloating,
  useInteractions,
  offset,
  shift,
  FloatingNode,
  useFloatingNodeId,
  useDismiss,
} from "@floating-ui/react";
import { useState } from "react";
import {
  DayPicker,
  getDefaultClassNames,
  type PropsSingle,
} from "react-day-picker";

interface IProps {
  inline?: boolean;
  unsetLabel: string;
  value: string;
  onChange: (newValue: string) => void;
  // Optional bounds; days outside [minDate, maxDate] are disabled.
  minDate?: Date;
  maxDate?: Date;
  // When this field has no value yet, open the calendar on this month so the
  // user lands near the other field's date instead of today.
  referenceDate?: Date;
}

// "YYYY-MM-DDTHH:mm" in local time, the format <input type="datetime-local"> expects.
function toDatetimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplay(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DateSelector = ({ value, onChange, unsetLabel, minDate, maxDate, referenceDate, inline = false }: IProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const nodeId = useFloatingNodeId();

  const { refs, floatingStyles, context } = useFloating({
    nodeId,
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [flip(), shift(), offset(3)],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context, {
    outsidePressEvent: "mousedown",
    bubbles: false,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  const defaultClassNames = getDefaultClassNames();
  const valueDate = value ? new Date(value) : undefined;

  const timeZoneLabel = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;

  const today = new Date();
  const maxSelectable = maxDate && maxDate < today ? maxDate : today;
  const disabledDays = [
    { after: maxSelectable },
    ...(minDate ? [{ before: minDate }] : []),
  ];

  // Picking a day from the calendar keeps whatever time-of-day was already
  // set (defaults to midnight for a brand-new value).
  function onDateSelect(date: Date | undefined) {
    if (!date) return;
    const next = new Date(date);
    if (valueDate) {
      next.setHours(valueDate.getHours(), valueDate.getMinutes(), 0, 0);
    } else {
      next.setHours(0, 0, 0, 0);
    }
    onChange(next.toISOString());
  }

  // Adjust just the time-of-day on the already-selected day.
  function onTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!valueDate || !e.target.value) return;
    const [hours, minutes] = e.target.value.split(":").map(Number);
    const next = new Date(valueDate);
    next.setHours(hours || 0, minutes || 0, 0, 0);
    onChange(next.toISOString());
  }

  // Manually type (or pick via the native widget) the full date + time at once.
  function onManualChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return;
    const next = new Date(e.target.value);
    if (isNaN(next.getTime())) return;
    onChange(next.toISOString());
  }

  const typefix: PropsSingle = {
    mode: "single",
    selected: valueDate,
    onSelect: onDateSelect,
  };
  const showValue = value && formatDisplay(valueDate as Date);
  const defaultMonth = valueDate || referenceDate || undefined;

  const calendar = (
              <div className='shadow-lg bg-white dark:bg-gray-800 rounded-lg border border-slate-300 dark:border-gray-600'>
                {inline && showValue && (
                  <p className='px-3 pt-2 text-xs text-slate-600 dark:text-gray-300' aria-live='polite'>
                    {showValue}
                  </p>
                )}
                <DayPicker
                  mode='single'
                  selected={typefix.selected}
                  onSelect={typefix.onSelect}
                  defaultMonth={defaultMonth}
                  disabled={disabledDays}
                  startMonth={new Date(2024, 7)}
                  endMonth={maxSelectable}
                  classNames={{
                    day: "dark:bg-gray-700",
                    caption_label: "text-sm font-medium",
                    month_caption: "items-center flex",
                    month_grid: `${defaultClassNames.month_grid}`,
                    today: `border-green-700 rounded`,
                    selected: `bg-green-700 dark:bg-green-700 dark:saturate-[0.7] border-green-500 text-white dark:text-gray-300 rounded`,
                    root: `${defaultClassNames.root} p-3 text-center`,
                    chevron: `${defaultClassNames.chevron} fill-green-700`,
                    nav: "absolute right-0 top-0 h-[2em]",
                  }}
                />
                <div className='flex flex-col gap-2 px-3 pb-3 pt-2 border-t border-slate-200 dark:border-gray-600'>
                  <label className='text-xs text-slate-500 dark:text-gray-400'>
                    Time {timeZoneLabel && <span className='opacity-60'>({timeZoneLabel})</span>}
                    <input
                      type='time'
                      className='block w-full mt-0.5 px-2 py-1 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded disabled:opacity-50'
                      value={
                        valueDate
                          ? `${String(valueDate.getHours()).padStart(2, "0")}:${String(
                              valueDate.getMinutes()
                            ).padStart(2, "0")}`
                          : ""
                      }
                      onChange={onTimeChange}
                      disabled={!valueDate}
                    />
                  </label>
                  <label className='text-xs text-slate-500 dark:text-gray-400'>
                    Or type exact date &amp; time
                    <input
                      type='datetime-local'
                      className='block w-full mt-0.5 px-2 py-1 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded'
                      value={valueDate ? toDatetimeLocalString(valueDate) : ""}
                      max={toDatetimeLocalString(maxSelectable)}
                      min={minDate ? toDatetimeLocalString(minDate) : undefined}
                      onChange={onManualChange}
                    />
                  </label>
                </div>
              </div>
  );

  if (inline) return calendar;

  return (
    <>
      <button
        ref={refs.setReference}
        type='button'
        className='relative w-36 px-2 py-1 bg-white dark:bg-gray-800 rounded hover:bg-slate-50 dark:hover:bg-gray-900 border border-slate-200 text-center truncate whitespace-nowrap'
        {...getReferenceProps()}
      >
        {showValue || unsetLabel || "Set Date"}
      </button>
      <FloatingNode id={nodeId}>
        {isOpen && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className='z-20 text-sm dark:bg-gray-700'
            >
              {calendar}
            </div>
          </FloatingPortal>
        )}
      </FloatingNode>
    </>
  );
};

export default DateSelector;
