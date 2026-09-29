import {
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { useState } from "react";
import { DayPicker, getDefaultClassNames, type DateRange } from "react-day-picker";
import { useFormatters } from "../../../utils/useFormatters";
import { addPickerDays, toPickerDay } from "../dashboardHelpers";

interface IProps {
  // Picker days (see toPickerDay); both are included in the range.
  fromDay: string;
  toDay: string;
  onChange: (fromDay: string, toDay: string) => void;
  // Longest range, in days, counting both ends.
  maxSpanDays: number;
}

// Recolors react-day-picker's own range styling (the band joining the two ends) to the
// app's green, instead of overriding its classes and losing the band. Its defaults are
// declared on .rdp-root itself, so these go on that element and win with `!`.
const calendarThemeClass = [
  "![--rdp-accent-color:#15803d]",
  "![--rdp-accent-background-color:#dcfce7]",
  "dark:![--rdp-accent-background-color:rgba(21,128,61,0.35)]",
  "![--rdp-day-height:36px] ![--rdp-day-width:36px]",
  "![--rdp-day_button-height:34px] ![--rdp-day_button-width:34px]",
].join(" ");

/**
 * One calendar for a whole date range. The first click picks one end — either one — and
 * limits the other to within `maxSpanDays` of it; the second click completes the range,
 * in whichever order the two days were picked.
 */
const DateRangeSelector = ({ fromDay, toDay, onChange, maxSpanDays }: IProps) => {
  const [isOpen, setIsOpen] = useState(false);
  // The first end of a range being picked; null while showing the committed range.
  const [anchor, setAnchor] = useState<Date | null>(null);
  // Two months side by side need ~560px; below Tailwind's `sm` breakpoint show one.
  // Measured on open rather than tracked, since the calendar is only open briefly.
  const [numberOfMonths, setNumberOfMonths] = useState(2);
  const { formatDate } = useFormatters();

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (open) {
        setNumberOfMonths(window.matchMedia("(min-width: 640px)").matches ? 2 : 1);
      }
      setIsOpen(open);
      // Closing mid-selection keeps the range that was already applied.
      setAnchor(null);
    },
    middleware: [flip(), shift({ padding: 16 }), offset(4)],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context, { outsidePressEvent: "mousedown" }),
  ]);

  function onDayClick(day: Date) {
    if (!anchor) {
      setAnchor(day);
      return;
    }
    const [start, end] = anchor <= day ? [anchor, day] : [day, anchor];
    onChange(toPickerDay(start), toPickerDay(end));
    setAnchor(null);
    setIsOpen(false);
  }

  const defaultClassNames = getDefaultClassNames();
  const today = new Date();
  const reach = maxSpanDays - 1;
  const disabled = anchor
    ? [
        { after: today },
        { before: new Date(addPickerDays(toPickerDay(anchor), -reach)) },
        { after: new Date(addPickerDays(toPickerDay(anchor), reach)) },
      ]
    : [{ after: today }];

  const selected: DateRange = anchor
    ? { from: anchor, to: undefined }
    : { from: new Date(fromDay), to: new Date(toDay) };

  return (
    <>
      <button
        ref={refs.setReference}
        type='button'
        aria-label='Custom date range'
        className='rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.08)] hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
        {...getReferenceProps()}
      >
        {formatDate(fromDay)} – {formatDate(toDay)}
      </button>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className='z-30 rounded-lg border border-slate-300 bg-white p-3 text-sm shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
          >
            <p className='mb-1 px-1 text-xs text-slate-500 dark:text-gray-400'>
              {anchor
                ? `Select the other end (up to ${maxSpanDays} days)`
                : "Select the first day of the range"}
            </p>
            <DayPicker
              mode='range'
              numberOfMonths={numberOfMonths}
              selected={selected}
              onSelect={(_range, triggerDate) => onDayClick(triggerDate)}
              disabled={disabled}
              // Two months open on the month before the range's end, so both ends
              // usually show; one month opens on the end itself.
              defaultMonth={
                new Date(numberOfMonths > 1 ? addPickerDays(toDay, -reach) : toDay)
              }
              endMonth={today}
              classNames={{
                root: `${defaultClassNames.root} ${calendarThemeClass}`,
                // The library's selected style also sets `font-size: large`, which makes
                // the range's dates jump in size; keep them the calendar's size.
                selected: `${defaultClassNames.selected} ![font-size:inherit]`,
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

export default DateRangeSelector;
