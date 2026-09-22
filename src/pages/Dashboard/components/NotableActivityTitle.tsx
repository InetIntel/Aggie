import { useMemo, useState } from "react";
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
   * The "asn / region" labels for this activity — one per impacted location. Start-time
   * grouping does not key on asn|geoScope, so this is routinely a multi-element list.
   * See `NotableActivity.locations` in api/analytics/types.ts.
   */
  titles: string[];
  fallback?: string;
  className?: string;
}

interface ParsedLocation {
  asn: string;
  region: string;
}

// Backend labels are built as `[asn, geoScope].filter(Boolean).join(' / ')`, so a
// one-part label is either an ASN or a region — this tells them apart.
const ASN_PATTERN = /^as\d+$/i;

// Two rendered lines at text-base (1rem) with leading-snug (1.375):
// 1 * 1.375 * 2 = 2.75rem. Reserving this height keeps 1-line and 2-line
const TWO_LINE_MIN_HEIGHT = "2.75rem";

// How many regions are named inline before the primary line switches to "+N more".
const INLINE_REGION_LIMIT = 2;

export default function NotableActivityTitle({
  titles,
  fallback = "Location details unavailable",
  className,
}: NotableActivityTitleProps) {
  const items = useMemo(() => titles.filter(Boolean), [titles]);

  const { regions, asns } = useMemo(() => splitLocations(items), [items]);

  const hasDetails = items.length > 0;

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

  return (
    <div className={className}>
      <p
        className='line-clamp-2 text-base font-medium leading-snug text-slate-900 dark:text-white'
        style={{ minHeight: TWO_LINE_MIN_HEIGHT }}
        title={items.join(", ")}
      >
        {items.length > 0 ? formatRegionSummary(regions) : fallback}
      </p>

      <div className='mt-1.5 flex h-5 items-center'>
        {hasDetails && (
          <button
            type='button'
            ref={refs.setReference}
            {...getReferenceProps()}
            className='rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          >
            View details
          </button>
        )}
      </div>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className='z-30 max-h-72 w-max max-w-xs space-y-4 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800'
          >
            <LocationDetailGroup title='Regions' values={regions} />
            <LocationDetailGroup title='ASNs' values={asns} />
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}

// One category of the details popover.
function LocationDetailGroup({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;

  return (
    <div>
      <p className='border-b border-slate-200 pb-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-slate-400 dark:border-gray-600 dark:text-gray-500'>
        {title}
      </p>
      <ul className='mt-1.5 space-y-1'>
        {values.map((value) => (
          <li
            key={value}
            className='text-xs font-medium text-slate-800 dark:text-gray-100'
          >
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Splits each "asn / region" label back into its parts and collects the distinct regions
 * and ASNs, so the card reads as a region line and the popover can list the two
 * categories separately instead of repeating one long comma list.
 */
function splitLocations(items: string[]) {
  const parsed = items.map(parseLocation);

  return {
    regions: [...new Set(parsed.map(({ region }) => region).filter(Boolean))],
    asns: [...new Set(parsed.map(({ asn }) => asn).filter(Boolean))],
  };
}

function parseLocation(label: string): ParsedLocation {
  const parts = label
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    return { asn: formatAsn(parts[0]), region: parts.slice(1).join(" / ") };
  }

  const only = parts[0] || "";
  return ASN_PATTERN.test(only)
    ? { asn: formatAsn(only), region: "" }
    : { asn: "", region: only };
}

// Reports store ASNs lowercase ("as12345"); display them the conventional way.
function formatAsn(value: string) {
  return ASN_PATTERN.test(value) ? value.toUpperCase() : value;
}

function formatRegionSummary(regions: string[]) {
  if (regions.length <= INLINE_REGION_LIMIT) return regions.join(" · ");

  const shown = regions.slice(0, INLINE_REGION_LIMIT).join(" · ");
  return `${shown} +${regions.length - INLINE_REGION_LIMIT} more regions`;
}
