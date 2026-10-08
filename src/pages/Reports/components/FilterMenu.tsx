import { useRef, useState } from "react";
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
import { faCaretRight, faCheck, faFilter } from "@fortawesome/free-solid-svg-icons";

// Shared look for the selected state of options and the active filter chips,
// so a chip visibly matches the option that produced it.
export const SELECTED_CSS =
  "bg-lime-300 hover:bg-lime-400 text-slate-900 dark:bg-lime-700 dark:hover:bg-lime-600 dark:text-lime-50";

const triggerCSS = (open: boolean) =>
  `focus-theme inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 font-medium text-sm ${open
    ? "bg-aggie-teal-10 text-aggie-secondary-650 border-aggie-secondary-500 dark:bg-gray-700 dark:text-gray-100"
    : "bg-aggie-secondary-500 text-white border-aggie-secondary-650 hover:bg-aggie-secondary-650"
  }`;

export const PANEL_CSS =
  "rounded-lg border-2 border-aggie-secondary-650 bg-white dark:bg-gray-800 drop-shadow-lg text-sm";

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
  /** true when this category currently narrows the results */
  active?: boolean;
  content: (close: () => void) => React.ReactNode;
}

/**
 * The "Filter" button: a list of filter categories, each opening its options
 * in a panel to the right of the row it belongs to.
 */
const FilterMenu = ({ categories }: { categories: FilterCategory[] }) => {
  const [activeId, setActiveId] = useState<string>();
  const [submenuTop, setSubmenuTop] = useState(0);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = categories.find((category) => category.id === activeId);

  function openCategory(id: string) {
    setActiveId(id);
    setSubmenuTop(rowRefs.current[id]?.offsetTop ?? 0);
  }

  return (
    <ToolbarPopover label='Filter' icon={faFilter}>
      {(close) => (
        <div className='flex items-start gap-2'>
          <ul className={`${PANEL_CSS} relative p-1.5 m-0 list-none min-w-[11rem]`} role='menu'>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type='button'
                  role='menuitem'
                  aria-haspopup='true'
                  aria-expanded={category.id === activeId}
                  ref={(el) => (rowRefs.current[category.id] = el)}
                  onMouseEnter={() => openCategory(category.id)}
                  onFocus={() => openCategory(category.id)}
                  onClick={() => openCategory(category.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 my-0.5 rounded-md text-left whitespace-nowrap ${category.id === activeId
                    ? SELECTED_CSS
                    : "hover:bg-slate-100 dark:hover:bg-gray-700"
                    }`}
                >
                  <FontAwesomeIcon icon={category.icon} fixedWidth className='text-slate-600 dark:text-gray-300' />
                  <span className='flex-1'>{category.label}</span>
                  {category.active && (
                    <span className='w-1.5 h-1.5 rounded-full bg-aggie-secondary-500' title='Filter applied' />
                  )}
                  <FontAwesomeIcon icon={faCaretRight} />
                </button>
              </li>
            ))}
          </ul>
          {active && (
            <div className={`${PANEL_CSS} overflow-hidden`} style={{ marginTop: submenuTop - 6 }}>
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
        className={`w-full flex items-center justify-between gap-3 px-2 py-1.5 my-0.5 rounded-md text-left whitespace-nowrap ${isSelected(option) ? SELECTED_CSS : "hover:bg-slate-100 dark:hover:bg-gray-700"
          }`}
      >
        {getLabel(option)}
        {isSelected(option) && <FontAwesomeIcon icon={faCheck} className='text-xs' />}
      </button>
    ))}
    {onClear && (
      <button
        type='button'
        onClick={onClear}
        className='w-full px-2 py-1.5 my-0.5 rounded-md text-left hover:bg-slate-100 dark:hover:bg-gray-700'
      >
        All
      </button>
    )}
    {footer}
  </div>
);

export default FilterMenu;
