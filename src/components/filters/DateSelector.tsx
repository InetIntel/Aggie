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

const DateSelector = ({ value, onChange, unsetLabel, minDate, maxDate, referenceDate }: IProps) => {
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

  function onDateSelect(date: Date | undefined) {
    if (!date) return;
    const day = date.toISOString();
    onChange(day);
    setIsOpen(false);
  }

  const valueDate = value ? new Date(value) : undefined;
  // weird typescript issues
  const typefix: PropsSingle = {
    mode: "single",
    selected: valueDate,
    onSelect: onDateSelect,
  };
  const showDate = value && new Date(value)?.toLocaleDateString();

  const today = new Date();
  // Never allow future dates; also respect an optional upper bound (e.g. the
  // chosen "before" date when picking "after", and vice-versa).
  const maxSelectable = maxDate && maxDate < today ? maxDate : today;
  const disabledDays = [
    { after: maxSelectable },
    ...(minDate ? [{ before: minDate }] : []),
  ];
  // Show this field's own value if set, else the other field's month, else today.
  const defaultMonth = valueDate || referenceDate || undefined;
  return (
    <>
      <button
        ref={refs.setReference}
        type='button'
        className='relative w-24 px-2 py-1 bg-white dark:bg-gray-800 rounded hover:bg-slate-50 dark:hover:bg-gray-900 border border-slate-200 text-center truncate whitespace-nowrap'
        {...getReferenceProps()}
      >
        {showDate || unsetLabel || "Set Date"}
      </button>
      <FloatingNode id={nodeId}>
        {isOpen && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className='z-20  text-sm dark:bg-gray-700'
            >
              <DayPicker
                mode='single'
                selected={typefix.selected}
                onSelect={typefix.onSelect}
                defaultMonth={defaultMonth}
                disabled={disabledDays}
                startMonth={new Date(2024, 7)}
                endMonth={maxSelectable}
                classNames={{
                  day:"dark:bg-gray-700",
                  caption_label: "text-sm font-medium",
                  month_caption: "items-center flex",
                  month_grid: `${defaultClassNames.month_grid}`,
                  today: `border-green-700 rounded`, // Add a border to today's date
                  selected: `bg-green-700 dark:bg-green-700 dark:saturate-[0.7] border-green-500 text-white dark:text-gray-300 rounded`, // Highlight the selected day
                  root: `${defaultClassNames.root} shadow-lg p-3 bg-white dark:bg-gray-800 rounded-lg border border-slate-300 text-center`, // Add a shadow to the root element
                  chevron: `${defaultClassNames.chevron} fill-green-700`, // Change the color of the chevron
                  nav: "absolute right-0 top-0 h-[2em]",
                }}
              />
            </div>
          </FloatingPortal>
        )}
      </FloatingNode>
    </>
  );
};

export default DateSelector;
