import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import { hasId } from "../../api/common";
import AggieDialog from "../AggieDialog";
import AggieButton from "../AggieButton";

interface CompareCardOpts {
  isHighlighted: boolean;
  onToggleHighlight: () => void;
}

interface IProps<T extends hasId> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  items: T[];
  renderCard: (item: T, opts: CompareCardOpts) => React.ReactNode;
  /**
   * Footer receives the "effective" target set: the highlighted items, or all
   * items when nothing is highlighted. (Clicking a card highlights it for the
   * footer actions; with none highlighted the actions fall back to everything.)
   */
  footer?: (effective: T[]) => React.ReactNode;
}

// Generic side-by-side comparison modal: a responsive grid of detail cards with
// a per-card highlight selection and an optional action footer. Type-specific
// cards/footers are supplied by the caller (alerts today; incidents later).
function CompareModal<T extends hasId>({
  isOpen,
  onClose,
  title,
  items,
  renderCard,
  footer,
}: IProps<T>) {
  const [highlighted, setHighlighted] = useState<string[]>([]);

  // Close once every card has been removed from the comparison.
  useEffect(() => {
    if (isOpen && items.length === 0) onClose();
  }, [isOpen, items.length, onClose]);

  const toggleHighlight = (id: string) =>
    setHighlighted((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );

  const highlightedItems = items.filter((i) => highlighted.includes(i._id));
  const effective = highlightedItems.length ? highlightedItems : items;

  return (
    <AggieDialog
      isOpen={isOpen}
      onClose={onClose}
      className='w-full max-w-7xl h-[90vh] flex flex-col p-4'
    >
      <div className='flex items-center justify-between mb-2'>
        <h2 className='text-lg font-medium'>{title}</h2>
        <AggieButton
          variant='transparent'
          aria-label='Close'
          onClick={onClose}
          icon={faXmark}
        />
      </div>

      {/* Fixed-height body: the grid divides it into equal rows (auto-rows-fr)
          so every card gets an identical slot; overflow scrolls per-card, never
          the modal. */}
      <div className='flex-1 min-h-0 -mx-1 px-1'>
        <div className='h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr gap-2 text-xs'>
          {items.map((item) => (
            <div key={item._id} className='min-h-0 h-full'>
              {renderCard(item, {
                isHighlighted: highlighted.includes(item._id),
                onToggleHighlight: () => toggleHighlight(item._id),
              })}
            </div>
          ))}
        </div>
      </div>

      {footer && (
        <div className='mt-2 pt-2 border-t border-slate-200 dark:border-gray-700'>
          {footer(effective)}
        </div>
      )}
    </AggieDialog>
  );
}

export default CompareModal;
