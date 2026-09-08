import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  Brush,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { IodaChartData } from "../../api/reports/types";
import { SIGNAL_HEX, SIGNAL_LABEL, SIGNAL_CHART_LABEL } from "./reportParser";

interface IProps {
  chart: IodaChartData;
  /** Bound the chart height for fixed-size contexts (compare grid). */
  compact?: boolean;
  /**
   * Fill the parent's height instead of using a fixed height. Use only when the parent
   * has a definite height (e.g. the compare card's flex band); in auto-height contexts
   * this would collapse to 0.
   */
  fill?: boolean;
  /** Outage window (unix seconds) — shaded to mark the event. Omit to skip. */
  outageStart?: number;
  /** Outage end (unix seconds); omit while the outage is ongoing (shades to window end). */
  outageEnd?: number;
}

// One merged row per timestamp: recharts wants a single data array, so we key every
// series' points by ts and leave gaps null (connectNulls bridges differing steps).
type Row = { ts: number } & Record<string, number | null>;

const TWO_DAYS = 2 * 24 * 60 * 60;

// Chart geometry — shared by the recharts layout and the custom Brush-label overlay so the
// labels line up with the navigator track. The Brush spans the plot width: from the Y-axis's
// right edge (AXIS_WIDTH) to MARGIN_RIGHT off the container's right edge.
const AXIS_WIDTH = 44;
const MARGIN_RIGHT = 28;
const MARGIN_BOTTOM = 4;

// IODA's simplified view overlays each signal on a shared 0–100% axis by normalizing it to
// its own level over the window. We divide by each series' max (its "normal") so a dip during
// the outage reads as a fall from ~100% toward 0, matching the scraped dashboard chart.
function normalize(points: IodaChartData["series"][number]["points"]): Array<[number, number | null]> {
  let max = 0;
  for (const [, v] of points) {
    if (typeof v === "number" && v > max) max = v;
  }
  if (max <= 0) return points.map(([ts]) => [ts, null]);
  return points.map(([ts, v]) => [ts, typeof v === "number" ? (v / max) * 100 : null]);
}

function fmtUtc(ts: number, opts: Intl.DateTimeFormatOptions): string {
  return new Date(ts * 1000).toLocaleString(undefined, { timeZone: "UTC", ...opts });
}

// Candidate axis steps (seconds) for the navigator time axis, coarse enough to cover weeks.
const NAV_STEPS = [
  3600, 2 * 3600, 3 * 3600, 6 * 3600, 12 * 3600,
  86400, 2 * 86400, 7 * 86400, 14 * 86400, 30 * 86400,
];

// Build the static full-range time ticks shown under the navigator bar, à la IODA: a tick at
// each nice interval, labelled with the date at UTC midnight and the time otherwise.
function buildNavTicks(from: number, to: number, maxTicks: number) {
  if (!from || !to || to <= from) return [] as Array<{ ts: number; pct: number; label: string }>;
  const span = to - from;
  const step = NAV_STEPS.find((s) => span / s <= maxTicks) || NAV_STEPS[NAV_STEPS.length - 1];
  const ticks: Array<{ ts: number; pct: number; label: string }> = [];
  for (let ts = Math.ceil(from / step) * step; ts <= to; ts += step) {
    const pct = ((ts - from) / span) * 100;
    if (pct < 0 || pct > 100) continue;
    const isMidnight = (((ts % 86400) + 86400) % 86400) === 0;
    const label = isMidnight
      ? fmtUtc(ts, { month: "short", day: "numeric" })
      : fmtUtc(ts, { hour: "numeric", minute: "2-digit", hour12: true });
    ticks.push({ ts, pct, label });
  }
  return ticks;
}

// Roughly the horizontal room one navigator time label needs before neighbours collide.
const PX_PER_NAV_TICK = 64;

const IodaChart = ({ chart, compact, fill, outageStart, outageEnd }: IProps) => {
  // Measure the rendered width so the navigator axis can thin its ticks on narrow cards
  // (compare grid) instead of overlapping. 0 until the first ResizeObserver callback.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { rows, activeDatasources } = useMemo(() => {
    const byTs = new Map<number, Row>();
    const active: string[] = [];

    for (const s of chart.series || []) {
      const normalized = normalize(s.points);
      const hasValue = normalized.some(([, v]) => v !== null);
      if (!hasValue) continue;
      active.push(s.datasource);
      for (const [ts, v] of normalized) {
        const row = byTs.get(ts) || ({ ts } as Row);
        row[s.datasource] = v;
        byTs.set(ts, row);
      }
    }

    const sorted = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
    return { rows: sorted, activeDatasources: active };
  }, [chart]);

  if (!rows.length || !activeDatasources.length) return null;

  const span = chart.until - chart.from;
  const tickFmt = (ts: number) =>
    span > TWO_DAYS
      ? fmtUtc(ts, { month: "short", day: "numeric" })
      : fmtUtc(ts, { hour: "numeric", minute: "2-digit", hour12: true });

  const height = compact ? 220 : 308;
  const brushHeight = compact ? 34 : 46;
  const shadeEnd = outageEnd ?? chart.until;
  const showOutage =
    typeof outageStart === "number" && shadeEnd > outageStart && outageStart < chart.until;

  // Static full-range time axis for the navigator bar (independent of the zoom selection).
  // Tick count scales to the measured track width so narrow cards don't overlap; fall back
  // to a sensible default on the first render before the width is known.
  const trackWidth = width > 0 ? width - AXIS_WIDTH - MARGIN_RIGHT : compact ? 180 : 600;
  const maxTicks = Math.max(2, Math.min(11, Math.floor(trackWidth / PX_PER_NAV_TICK)));
  const navTicks = buildNavTicks(rows[0].ts, rows[rows.length - 1].ts, maxTicks);

  return (
    // text-* drives recharts axis/grid ink via currentColor so it adapts to dark mode.
    // fill mode: fill a definite-height parent (compare band) with the legend pinned below.
    <div
      ref={wrapRef}
      className={
        fill
          ? "flex h-full w-full flex-col text-slate-500 dark:text-gray-400"
          : "w-full text-slate-500 dark:text-gray-400"
      }
    >
      <div className={fill ? "min-h-0 flex-1" : undefined} style={fill ? undefined : { height }}>
      <ResponsiveContainer width='100%' height='100%'>
        {/* right margin leaves room for the rightmost X-axis tick; left is the Y-axis. */}
        <LineChart data={rows} margin={{ top: 8, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM, left: 0 }}>
          <CartesianGrid stroke='currentColor' strokeOpacity={0.15} vertical={false} />
          {showOutage && (
            <ReferenceArea
              x1={outageStart}
              x2={shadeEnd}
              fill='#ef4444'
              fillOpacity={0.08}
              strokeOpacity={0}
            />
          )}
          <XAxis
            dataKey='ts'
            type='number'
            scale='time'
            // dataMin/dataMax (not the fixed window) so dragging the Brush rescales the
            // axis to the selected slice — i.e. zooms, like IODA's navigator — instead of
            // clipping the lines against a locked full-window axis.
            domain={["dataMin", "dataMax"]}
            tickFormatter={tickFmt}
            tick={{ fill: "currentColor", fontSize: 11 }}
            stroke='currentColor'
            strokeOpacity={0.3}
            minTickGap={40}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "currentColor", fontSize: 11 }}
            stroke='currentColor'
            strokeOpacity={0.3}
            width={AXIS_WIDTH}
          />
          <Tooltip content={<SignalTooltip />} />
          {activeDatasources.map((ds) => (
            <Line
              key={ds}
              type='monotone'
              dataKey={ds}
              name={SIGNAL_CHART_LABEL[ds] || SIGNAL_LABEL[ds] || ds}
              stroke={SIGNAL_HEX[ds] || "#64748b"}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {/* Navigator strip: mirrors IODA's dashboard range-selector so the user can zoom
              into a sub-window. Shown everywhere, including compact/table (compare) cards.
              recharts' own handle labels anchor OUTWARD and clip off the edges, so they're
              hidden; the full-range time axis below the strip carries the time context. */}
          <Brush
            dataKey='ts'
            height={brushHeight}
            travellerWidth={8}
            stroke='#94a3b8'
            tickFormatter={() => ""}
            gap={4}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
      {/* Full-range time axis under the navigator bar, like IODA's — ticks span the whole
          window (not the zoomed selection). Aligned to the Brush track via the same
          left/right insets. */}
      <div
        className='pointer-events-none relative h-4 shrink-0'
        style={{ marginLeft: AXIS_WIDTH, marginRight: MARGIN_RIGHT }}
      >
        {navTicks.map((t) => (
          <div
            key={t.ts}
            className='absolute top-0 flex flex-col items-center'
            style={{ left: `${t.pct}%`, transform: "translateX(-50%)" }}
          >
            <span className='block h-1 w-px bg-current opacity-40' />
            <span className='mt-0.5 whitespace-nowrap text-[10px] leading-none text-slate-500 dark:text-gray-400'>
              {t.label}
            </span>
          </div>
        ))}
      </div>
      <ChartLegend datasources={activeDatasources} />
    </div>
  );
};

// Custom legend: colored line swatch carries identity, label stays in neutral ink.
// Centered when the items fit on one line; left-aligned once they wrap (centered wrapped
// rows read as ragged/off on narrow cards). CSS can't switch on wrap, so we detect it by
// checking whether any item sits on a lower row than the first.
const ChartLegend = ({ datasources }: { datasources: string[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [wrapped, setWrapped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => {
      const items = Array.from(el.children) as HTMLElement[];
      const firstTop = items[0]?.offsetTop ?? 0;
      // justify-content doesn't affect wrapping, so toggling alignment can't oscillate.
      setWrapped(items.some((it) => it.offsetTop > firstTop));
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [datasources]);

  return (
    <div
      ref={ref}
      className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs ${
        wrapped ? "justify-start" : "justify-center"
      }`}
    >
      {datasources.map((ds) => (
        <span key={ds} className='inline-flex items-center gap-1.5'>
          <span
            className='inline-block h-0.5 w-4 rounded'
            style={{ backgroundColor: SIGNAL_HEX[ds] || "#64748b" }}
          />
          <span className='text-slate-600 dark:text-gray-300'>
            {SIGNAL_CHART_LABEL[ds] || SIGNAL_LABEL[ds] || ds}
          </span>
        </span>
      ))}
    </div>
  );
};

const SignalTooltip = ({ payload, label }: TooltipProps<number, string>) => {
  if (!payload || !payload.length) return null;
  const ts = typeof label === "number" ? label : Number(label);
  return (
    <div className='rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs shadow'>
      <div className='mb-0.5 font-medium text-slate-700 dark:text-gray-200'>
        {new Date(ts * 1000).toLocaleString(undefined, {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}{" "}
        UTC
      </div>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className='flex items-center gap-1.5'>
          <span
            className='inline-block h-0.5 w-3 rounded'
            style={{ backgroundColor: entry.color }}
          />
          <span className='text-slate-600 dark:text-gray-300'>{entry.name}</span>
          <span className='ml-auto font-medium text-slate-700 dark:text-gray-200'>
            {typeof entry.value === "number" ? `${Math.round(entry.value)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
};

export default IodaChart;
