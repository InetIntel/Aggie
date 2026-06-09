import { useState } from "react";
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
      className='w-full max-w-7xl max-h-[90vh] flex flex-col p-4'
    >
      <div className='flex items-center justify-between mb-3'>
        <h2 className='text-xl font-medium'>{title}</h2>
        <AggieButton
          variant='transparent'
          aria-label='Close'
          onClick={onClose}
          icon={faXmark}
        />
      </div>

      <div className='flex-1 overflow-y-auto -mx-1 px-1'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          {items.map((item) => (
            <div key={item._id}>
              {renderCard(item, {
                isHighlighted: highlighted.includes(item._id),
                onToggleHighlight: () => toggleHighlight(item._id),
              })}
            </div>
          ))}
        </div>
      </div>

      {footer && (
        <div className='mt-3 pt-3 border-t border-slate-200 dark:border-gray-700'>
          {footer(effective)}
        </div>
      )}
    </AggieDialog>
  );
}

export default CompareModal;
