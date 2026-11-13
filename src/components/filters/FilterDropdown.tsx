import {
  useFloating,
  shift,
  flip,
  offset,
  useClick,
  useInteractions,
  FloatingPortal,
  useDismiss,
  FloatingTree,
  useFloatingNodeId,
  FloatingNode,
} from "@floating-ui/react";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Popover } from "@headlessui/react";
import React, { useState } from "react";
//BACKLOG: use popper-react for nicer pop-overs
interface passToChildProps {
  close: () => void;
}

interface IProps {
  label: string;
  children: (props: passToChildProps) => React.ReactNode;
  value?: string;
  onReset?: () => void;
  headerChild?: React.ReactNode;
  panelClassName?: string;
  onOpenChange?: (i: boolean) => void;
  // Keep the label visible in the trigger even when a value is set (the value
  // still drives the active highlight). Prevents the trigger from resizing to
  // fit long values like a date range.
  persistLabel?: boolean;
  // Render the trigger as the column header text itself (no caret, header font),
  // so a table header can double as its own search/filter button.
  headerStyle?: boolean;
}

const FilterDropdown = ({
  label,
  children,
  value,
  onReset = () => { },
  headerChild,
  panelClassName,
  onOpenChange,
  persistLabel,
  headerStyle,
}: IProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const nodeId = useFloatingNodeId();

  function setOpenState(i: boolean) {
    if (onOpenChange) onOpenChange(i);

    setIsOpen(i);
  }

  const { refs, floatingStyles, context } = useFloating({
    nodeId,
    open: isOpen,
    placement: headerStyle ? "bottom-start" : "bottom-end",

    onOpenChange: setOpenState,
    middleware: [
      offset(1),
      flip({ fallbackAxisSideDirection: "start", crossAxis: false }),

      shift({ padding: 5 }),
    ],
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
  function close() {
    setOpenState(false);
  }
  return (
    <div className='relative'>
      <button
        type="button"
        title={headerStyle ? (value ? `${label}: ${value}` : `Filter by ${label}`) : undefined}
        className={
          headerStyle
            ? `focus-theme rounded px-1 -mx-1 font-semibold whitespace-nowrap hover:bg-slate-100 dark:hover:bg-gray-700 hover:underline ${
                value || isOpen ? "bg-slate-200 dark:bg-gray-600" : ""
              }`
            : `focus-theme py-1 hover:bg-slate-100 dark:hover:bg-gray-700 hover:underline line-clamp-1 max-w-[24em] whitespace-nowrap ${isOpen ? "bg-slate-100 dark:bg-gray-700" : ""
              } rounded ${value ? "bg-slate-200 dark:bg-gray-600 px-2" : persistLabel ? "px-2" : "px-1"}`
        }
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        {headerStyle ? (
          <>
            {label}
            <FontAwesomeIcon
              icon={faCaretDown}
              className={`${isOpen ? "rotate-180" : ""} ml-1 text-slate-500 dark:text-gray-400`}
            />
          </>
        ) : (
          <>
            <FontAwesomeIcon
              icon={faCaretDown}
              className={`${isOpen ? "rotate-180" : ""} mr-1 text-slate-500 dark:text-gray-400`}
            />
            {persistLabel ? label : value ? value : label}
          </>
        )}
      </button>
      <FloatingNode id={nodeId}>
        {isOpen && (
          <FloatingPortal>
            <div
              className={`rounded-lg border border-slate-300 bg-slate-100 dark:bg-gray-700 overflow-hidden drop-shadow-lg z-[1000] text-sm dark:bg-gray-800 ${panelClassName || "w-max min-w-[150px]"
                }`}
              style={floatingStyles}
              ref={refs.setFloating}
              {...getFloatingProps()}
            >
              <>
                <header className='py-1 px-1 border-b border-slate-300 relative'>
                  <div className='flex justify-between mb-1 ml-1 items-center'>
                    <h3 className='text-sm font-medium '>{label}</h3>

                    {value && (
                      <button
                        type="button"
                        className='px-1 -mr-1 rounded hover:bg-slate-200 dark:hover:bg-gray-600 absolute right-2 text-slate-600 dark:text-gray-400 underline'
                        onClick={() => {
                          onReset();
                          setIsOpen(false);
                        }}
                      >
                        clear
                      </button>
                    )}
                  </div>
                  {headerChild && headerChild}
                </header>
                {children({ close })}
              </>
            </div>
          </FloatingPortal>
        )}
      </FloatingNode>
    </div>
  );
};

export default FilterDropdown;
