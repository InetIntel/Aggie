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
  }

  const valueDate = value ? new Date(value) : undefined;
  // weird typescript issues
  const typefix: PropsSingle = {
    mode: "single",
    selected: valueDate,
    onSelect: onDateSelect,
  };
  return (
    <>
      <button
        ref={refs.setReference}
        type='button'
        className='relative'
        {...getReferenceProps()}
      >
        {value || unsetLabel || "Set Date"}
      </button>
      <FloatingNode id={nodeId}>
        {isOpen && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className='z-20'
            >
              <DayPicker
                mode='single'
                selected={typefix.selected}
                onSelect={typefix.onSelect}
                classNames={{
                  today: `border-amber-500`, // Add a border to today's date
                  selected: `bg-amber-500 border-amber-500 text-white`, // Highlight the selected day
                  root: `${defaultClassNames.root} shadow-lg p-3 bg-white rounded-lg border border-slate-300`, // Add a shadow to the root element
                  chevron: `${defaultClassNames.chevron} fill-amber-500`, // Change the color of the chevron
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
