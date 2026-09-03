import { useLayoutEffect, useRef, useState } from "react";
import {
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
  autoUpdate,
  offset,
  flip,
  shift,
} from "@floating-ui/react";

interface NotableActivityTitleProps {
  /**
   * The ASN / location titles for this activity. Today the backend returns a
   * single `asn / geoScope` summary, so this is usually a one-element list, but
   * the component is built to concatenate many titles (multiple impacted ASNs)
   * into the reserved two lines. See `NotableActivity` in api/analytics/types.ts.
   */
  titles: string[];
  fallback?: string;
  className?: string;
}

// Two rendered lines at text-base (1rem) with leading-snug (1.375):
// 1 * 1.375 * 2 = 2.75rem. Reserving this height keeps 1-line and 2-line
// (or clamped multi-line) titles the same height so cards align in the grid.
const TWO_LINE_MIN_HEIGHT = "2.75rem";

/**
 * Renders the notable-activity card title clamped to two lines with a reserved
 * two-line height (so cards stay aligned regardless of title length). The
 * "Show all ASNs" button stays disabled unless the concatenated titles overflow
 * the two lines, in which case it opens a scrollable popover listing every title.
 */
export default function NotableActivityTitle({
  titles,
  fallback = "Location details unavailable",
  className,
}: NotableActivityTitleProps) {
  const items = titles.filter(Boolean);
  const hasItems = items.length > 0;

  const clampRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    // Keep the popover anchored to the button while it's open (re-position on
    // scroll/resize) instead of computing its position only once on open.
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  // The title overflows the reserved two lines when its full content height
  // (scrollHeight) exceeds the clamped/rendered height (clientHeight). +1 guards
  // against sub-pixel rounding when the content is exactly two lines.
  useLayoutEffect(() => {
    const el = clampRef.current;
    if (!el) {
      setIsTruncated(false);
      return;
    }

    const measure = () => setIsTruncated(el.scrollHeight > el.clientHeight + 1);

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // Re-measure whenever the concatenated content changes.
  }, [items.join("")]);

  return (
    <div className={className}>
      <p
        ref={clampRef}
        className='line-clamp-2 text-base italic leading-snug text-slate-700 dark:text-gray-300'
        style={{ minHeight: TWO_LINE_MIN_HEIGHT }}
      >
        {hasItems ? items.join(", ") : fallback}
      </p>

      {/* Reserved trigger row: the button is always present (constant height, so
          cards align) but stays disabled unless titles overflow the two lines. */}
      <div className='mt-1 flex h-5 items-center'>
        <button
          type='button'
          ref={refs.setReference}
          disabled={!isTruncated}
          {...getReferenceProps()}
          className='rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:disabled:hover:bg-gray-700'
        >
          Show all ASNs
        </button>
      </div>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className='z-30 w-max max-w-xs rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800'
          >
            <p className='px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400'>
              {items.length > 1 ? `All ${items.length} locations` : "Location"}
            </p>
            <ul className='max-h-72 space-y-1 overflow-auto'>
              {items.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className='rounded px-1 py-0.5 text-xs italic text-slate-700 dark:text-gray-200'
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
