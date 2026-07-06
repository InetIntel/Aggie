import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import { hasId } from "../../api/common";
import AggieDialog from "../AggieDialog";
import AggieButton from "../AggieButton";

interface CompareCardOpts {
  isHighlighted: boolean;
  onToggleHighlight: () => void;
  /**
   * True for a single-row comparison (≤3 cards): cards size to content and the
   * card should render its chart width-driven so there's no vertical whitespace.
   * False for the multi-row grid, where cards share a fixed height.
   */
  fillWidth: boolean;
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

  // A single row (≤3 cards) sizes each card to its content (chart rendered
  // width-driven) so there's no wasted vertical space. From 4 cards up, the
  // multi-row grid instead shares max-h-[90vh] across rows at a fixed per-card
  // height (chart fit-to-height + the per-card enlarge button). ~9rem accounts
  // for the modal's header/footer/padding chrome.
  const fitContent = items.length <= 3;
  const rows = Math.max(1, Math.ceil(items.length / 3));
  // Floor the per-card height so the flexible chart region (the only non-fixed
  // band in CompareCardBody) can never be squeezed to 0 on short viewports. On
  // tall screens the computed term wins (shrink-to-fit, no modal scrollbar); on
  // short screens the floor wins and the modal body (overflow-y-auto) scrolls.
  const gridCardHeight = `max((90vh - 9rem) / ${rows} - 0.5rem, 22rem)`;

  return (
    <AggieDialog
      isOpen={isOpen}
      onClose={onClose}
      className='w-full max-w-7xl max-h-[90vh] flex flex-col p-4'
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

      {/* ≤3 cards form a single row sized to content (no wasted vertical space);
          4+ share a fixed per-card height across the grid so they fit within
          max-h-[90vh]. Overflow scrolls per-card; the body only scrolls as a
          safety net on short screens. */}
      <div className='flex-1 min-h-0 -mx-1 px-1 py-1 overflow-y-auto'>
        {/* 3+ cards use the responsive grid (up to 3 per row). 1–2 cards would
            sit left-packed with empty grid columns, so center them at a fixed
            card width instead. */}
        <div
          className={
            items.length <= 2
              ? "flex justify-center gap-2 text-xs"
              : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs"
          }
        >
          {items.map((item) => (
            <div
              key={item._id}
              className={`min-h-0 ${
                items.length <= 2 ? "flex-1 max-w-2xl" : ""
              }`}
              style={fitContent ? undefined : { height: gridCardHeight }}
            >
              {renderCard(item, {
                isHighlighted: highlighted.includes(item._id),
                onToggleHighlight: () => toggleHighlight(item._id),
                fillWidth: fitContent,
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
