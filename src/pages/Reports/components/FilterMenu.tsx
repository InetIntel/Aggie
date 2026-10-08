import { useEffect, useRef, useState } from "react";
import {
  useFloating,
  autoUpdate,
  shift,
  flip,
  offset,
  useClick,
  useDismiss,
  useInteractions,
} from "@floating-ui/react";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretRight, faFilter } from "@fortawesome/free-solid-svg-icons";

// Shared look for the selected state of options and the active filter chips,
// so a chip visibly matches the option that produced it.
export const SELECTED_CSS =
  "bg-aggie-lime-400 hover:bg-aggie-lime-500 text-slate-900 dark:saturate-[0.8]";

const triggerCSS = (open: boolean) =>
  `focus-theme inline-flex items-center gap-1.5 px-2 py-1 rounded-md border-2 border-aggie-secondary-650 font-semibold text-sm ${open
    ? "bg-aggie-secondary-200 text-aggie-secondary-650"
    : "bg-aggie-secondary-500 text-white hover:bg-aggie-secondary-650"
  }`;

export const PANEL_CSS =
  "rounded-lg border-[1.5px] border-aggie-secondary-900 dark:border-gray-500 bg-white dark:bg-gray-800 shadow-md text-sm text-slate-800 dark:text-gray-100";

/** A toolbar button that toggles a floating panel below it. */
export const ToolbarPopover = ({
  label,
  icon,
  children,
}: {
  label: string;
  icon: IconProp;
  children: (close: () => void) => React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ crossAxis: false }), shift({ padding: 5 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  return (
    <>
      <button
        type='button'
        className={triggerCSS(isOpen)}
        aria-expanded={isOpen}
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        <FontAwesomeIcon icon={icon} />
        {label}
      </button>
      {isOpen && (
        <div ref={refs.setFloating} style={floatingStyles} className='z-20' {...getFloatingProps()}>
          {children(() => setIsOpen(false))}
        </div>
      )}
    </>
  );
};

export interface FilterCategory {
  id: string;
  label: string;
  icon: IconProp;
  content: (close: () => void) => React.ReactNode;
}

/**
 * The "Filter" button: a list of filter categories, each opening its options
 * in a panel to the right of the row it belongs to.
 */
const FilterMenu = ({ categories }: { categories: FilterCategory[] }) => {
  const [activeId, setActiveId] = useState<string>();
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const active = categories.find((category) => category.id === activeId);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  function openCategory(id: string) {
    clearTimeout(hoverTimer.current);
    setActiveId(id);
  }

  // Hovering switches the submenu only after the pointer rests on a row, so
  // moving diagonally from a row to its (tall) submenu doesn't flip it to
  // whichever rows the pointer crosses on the way.
  function hoverCategory(id: string) {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => openCategory(id), activeId ? 200 : 0);
  }

  return (
    <ToolbarPopover label='Filter' icon={faFilter}>
      {(close) => (
        <div className='flex items-start gap-2'>
          <ul className={`${PANEL_CSS} p-1.5 m-0 list-none min-w-[10.5rem]`} role='menu'>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type='button'
                  role='menuitem'
                  aria-haspopup='true'
                  aria-expanded={category.id === activeId}
                  onMouseEnter={() => hoverCategory(category.id)}
                  onMouseLeave={() => clearTimeout(hoverTimer.current)}
                  onFocus={() => openCategory(category.id)}
                  onClick={() => openCategory(category.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 my-0.5 rounded-md text-left whitespace-nowrap ${category.id === activeId
                    ? SELECTED_CSS
                    : "hover:bg-slate-100 dark:hover:bg-gray-700"
                    }`}
                >
                  <FontAwesomeIcon icon={category.icon} fixedWidth className='text-sm' />
                  <span className='flex-1'>{category.label}</span>
                  <FontAwesomeIcon icon={faCaretRight} className='text-xs' />
                </button>
              </li>
            ))}
          </ul>
          {active && (
            <div className={`${PANEL_CSS} overflow-hidden`}>
              {active.content(close)}
            </div>
          )}
        </div>
      )}
    </ToolbarPopover>
  );
};

/** Checklist of options for one category. */
export const FilterOptionList = ({
  options,
  isSelected,
  onToggle,
  onClear,
  getLabel = (option) => option,
  footer,
}: {
  options: string[];
  isSelected: (option: string) => boolean;
  onToggle: (option: string) => void;
  /** shows an "All" row that clears the category */
  onClear?: () => void;
  getLabel?: (option: string) => string;
  footer?: React.ReactNode;
}) => (
  <div className='p-1.5 min-w-[9rem]'>
    {options.map((option) => (
      <button
        key={option}
        type='button'
        role='menuitemcheckbox'
        aria-checked={isSelected(option)}
        onClick={() => onToggle(option)}
        className={`w-full block px-2 py-1 my-1 rounded-md text-left whitespace-nowrap ${isSelected(option) ? SELECTED_CSS : "hover:bg-slate-100 dark:hover:bg-gray-700"
          }`}
      >
        {getLabel(option)}
      </button>
    ))}
    {onClear && (
      <button
        type='button'
        onClick={onClear}
        className='w-full block px-2 py-1 my-1 rounded-md text-left hover:bg-slate-100 dark:hover:bg-gray-700'
      >
        All
      </button>
    )}
    {footer}
  </div>
);

export default FilterMenu;
