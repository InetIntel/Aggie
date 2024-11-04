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
}

const DateSelector = ({ value, onChange, unsetLabel }: IProps) => {
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
  return (
    <>
      <button
        ref={refs.setReference}
        type='button'
        className='relative px-2 py-1 bg-white rounded hover:bg-slate-50 border border-slate-200'
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
              className='z-20  text-sm'
            >
              <DayPicker
                mode='single'
                selected={typefix.selected}
                onSelect={typefix.onSelect}
                startMonth={new Date(2024, 7)}
                endMonth={today}
                classNames={{
                  caption_label: "text-sm font-medium",
                  month_caption: "items-center flex",
                  month_grid: `${defaultClassNames.month_grid}`,
                  today: `border-green-700 rounded`, // Add a border to today's date
                  selected: `bg-green-700 border-green-500 text-white rounded`, // Highlight the selected day
                  root: `${defaultClassNames.root} shadow-lg p-3 bg-white rounded-lg border border-slate-300 text-center`, // Add a shadow to the root element
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
