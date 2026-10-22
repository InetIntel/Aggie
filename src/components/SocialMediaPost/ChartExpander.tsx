import { ReactNode, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpRightAndDownLeftFromCenter,
  faDownLeftAndUpRightToCenter,
} from "@fortawesome/free-solid-svg-icons";

interface IProps {
  /**
   * Compact contexts (table/list expanded rows, compare grid) start the chart capped
   * and show a corner button that enlarges it inline; a Collapse button shrinks it
   * back. Non-compact renders full-size with no toggle. Enlarge state is local so each
   * row toggles independently.
   */
  compact?: boolean;
  /**
   * Let a click anywhere on the chart toggle enlarge (good for a static <img>). Turn
   * off for interactive charts (recharts, whose own Brush drag / tooltip hover would
   * conflict) — the corner button still toggles. Defaults to true.
   */
  surfaceClick?: boolean;
  /** Renders the chart for the current state; `enlarged` drives capped vs full sizing. */
  children: (enlarged: boolean) => ReactNode;
}

/**
 * Shared click-to-enlarge chrome for outage charts (IODA recharts + IODA/Cloudflare
 * image/SVG). Owns the enlarge state and the expand/collapse button; the caller renders
 * the actual chart via the render-prop child, sizing it off `enlarged`.
 */
const ChartExpander = ({ compact, surfaceClick = true, children }: IProps) => {
  const [enlarged, setEnlarged] = useState(false);

  // Non-compact standalone view: full-size, no toggle.
  if (!compact) return <>{children(false)}</>;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEnlarged((v) => !v);
  };

  return (
    <div className='relative'>
      <div
        className={
          surfaceClick ? (enlarged ? "cursor-zoom-out" : "cursor-zoom-in") : undefined
        }
        onClick={surfaceClick ? toggle : undefined}
      >
        {children(enlarged)}
      </div>
      <button
        type='button'
        onClick={toggle}
        title={enlarged ? "Collapse chart" : "Expand chart"}
        aria-label={enlarged ? "Collapse chart" : "Expand chart"}
        className={
          enlarged
            ? "absolute top-1 right-1 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white/90 dark:bg-gray-800/90 px-2 py-1 text-xs font-medium text-slate-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 shadow-sm"
            : "absolute top-1 right-1 inline-flex items-center rounded-full border border-slate-300 bg-white/90 dark:bg-gray-800/90 p-1.5 text-xs text-slate-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 shadow-sm"
        }
      >
        <FontAwesomeIcon
          icon={enlarged ? faDownLeftAndUpRightToCenter : faUpRightAndDownLeftFromCenter}
        />
        {enlarged && "Collapse"}
      </button>
    </div>
  );
};

export default ChartExpander;
