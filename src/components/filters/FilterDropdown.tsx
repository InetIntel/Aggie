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
}

const FilterDropdown = ({
  label,
  children,
  value,
  onReset = () => { },
  headerChild,
  panelClassName,
  onOpenChange,
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
    placement: "bottom-end",

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
        className={`focus-theme py-1 hover:bg-slate-100 hover:underline line-clamp-1 max-w-[24em] ${isOpen ? "bg-slate-100" : ""
          } rounded ${value ? "bg-slate-200 px-2" : "px-1"}`}
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        <>
          <FontAwesomeIcon
            icon={faCaretDown}
            className={`${isOpen ? "rotate-180" : ""} mr-1 text-slate-500`}
          />
          {value ? value : label}
        </>
      </button>
      <FloatingNode id={nodeId}>
        {isOpen && (
          <div
            className={`absolute mt-1 right-0 rounded-lg border border-slate-300  bg-slate-100 overflow-hidden w-[20em] drop-shadow-lg z-10 text-sm  ${panelClassName || "w-fit max-w-md"
              }`}
            style={floatingStyles}
            ref={refs.setFloating}
            {...getFloatingProps}
          >
            <>
              <header className='py-1 px-1 border-b border-slate-300 relative'>
                <div className='flex justify-between mb-1 ml-1 items-center'>
                  <h3 className='text-sm font-medium '>{label}</h3>

                  {value && (
                    <button
                      className='px-1 -mr-1 rounded hover:bg-slate-200 absolute right-2 text-slate-600  underline '
                      onClick={() => {
                        onReset();
                        // dont run "onOpenChange" when running reset to avoid weird state race condition stuff
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
        )}
      </FloatingNode>
    </div>
  );
};

export default FilterDropdown;
