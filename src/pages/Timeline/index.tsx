import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport } from "@fortawesome/free-solid-svg-icons";

import { getPublishedGroups } from "../../api/groups";
import type { Group } from "../../api/groups/types";
import { getAsnsByIds } from "../../api/asn";
import type { AsnInfoMap } from "../../api/asn/types";
import AggieSwitch from "../../components/AggieSwitch";
import TimelineCard from "./TimelineCard";
import {
  Anchor,
  assignLanes,
  BarSpan,
  incidentTier,
  isOngoing,
  monthKey,
  monthLabel,
  startTimeOf,
  TIER_STYLES,
  timeToY,
  toCsv,
  toTime,
  yearLabel,
} from "./timelineHelpers";
import { resolveTimeZone } from "../../utils/dateFormat";
import { useFormatters } from "../../utils/useFormatters";

const LANE_WIDTH = 8; // px between duration-bar lanes
const BAR_AXIS_GAP = 14; // px between the innermost lane and the axis
const MIN_BAR_HEIGHT = 4;

interface Layout {
  axisX: number;
  nowY: number;
  lastY: number;
  dotY: Record<string, number>;
}

function useAsnLookup(groups: Group[]) {
  const asns = useMemo(
    () => Array.from(new Set(groups.flatMap((g) => g.impactedAsns ?? []))).sort(),
    [groups]
  );
  const { data } = useQuery<AsnInfoMap>({
    queryKey: ["asn-bulk", asns],
    queryFn: () => getAsnsByIds(asns),
    enabled: asns.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const byLower = Object.fromEntries(
      Object.entries(data ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    return (asn: string) => byLower[asn.toLowerCase()];
  }, [data]);
}

// Measures where NOW, the axis, and every card's dot sit, re-measuring on resize
// (cards reflow, tags load in, fonts settle).
function useTimelineLayout(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef(new Map<string, HTMLElement>());
  const [layout, setLayout] = useState<Layout | null>(null);

  const setDotRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) dotRefs.current.set(id, el);
      else dotRefs.current.delete(id);
    },
    []
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const now = nowRef.current;
      if (!now) return;
      const box = container.getBoundingClientRect();
      const center = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      };
      const nowCenter = center(now);
      const dotY: Record<string, number> = {};
      let lastY = nowCenter.y;
      dotRefs.current.forEach((el, id) => {
        const y = center(el).y;
        dotY[id] = y;
        lastY = Math.max(lastY, y);
      });
      setLayout((prev) => {
        const next = { axisX: nowCenter.x, nowY: nowCenter.y, lastY, dotY };
        return prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { containerRef, nowRef, setDotRef, layout };
}

type Bar = BarSpan & { group: Group; lane: number };

// Places every incident's duration bar: from its dot (start) up to its end time,
// or up to NOW while it's ongoing, packed into lanes left of the axis.
function computeBars(groups: Group[], layout: Layout | null) {
  if (!layout) return { bars: [] as Bar[], laneCount: 0 };
  const now = Date.now();
  const anchors: Anchor[] = [
    { time: now, y: layout.nowY },
    ...groups
      .filter((g) => layout.dotY[g._id] !== undefined)
      .map((g) => ({ time: startTimeOf(g), y: layout.dotY[g._id] })),
  ];

  const spans = groups
    .filter((g) => layout.dotY[g._id] !== undefined && toTime(g.incidentStartedAt) !== null)
    .map((g) => {
      const bottom = layout.dotY[g._id];
      const end = toTime(g.incidentEndedAt);
      const endTime = isOngoing(g) || end === null ? now : end;
      const top = Math.min(timeToY(endTime, anchors), bottom - MIN_BAR_HEIGHT);
      return { id: g._id, top, bottom, group: g };
    });

  const { lanes, laneCount } = assignLanes(spans);
  return { bars: spans.map((s) => ({ ...s, lane: lanes[s.id] })), laneCount };
}

function DurationBars({ bars, axisX }: { bars: Bar[]; axisX: number }) {
  return (
    <>
      {bars.map(({ id, top, bottom, group, lane }) => {
        const tier = TIER_STYLES[incidentTier(group)];
        const x = axisX - BAR_AXIS_GAP - lane * LANE_WIDTH;
        const lineStyle = isOngoing(group) ? "border-dashed" : "border-solid";
        return (
          <Fragment key={id}>
            <div
              className={`absolute border-l-2 ${lineStyle} ${tier.border}`}
              style={{ left: x - 1, top, height: bottom - top }}
              title={group.title}
            />
            {/* connector from the bar's start to the incident's dot */}
            <div
              className={`absolute border-t ${tier.border}`}
              style={{ left: x, top: bottom, width: axisX - x }}
            />
            <div
              className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tier.dot}`}
              style={{ left: x, top: bottom }}
            />
          </Fragment>
        );
      })}
    </>
  );
}

function Legend() {
  return (
    <div className='flex flex-wrap justify-end gap-x-8 gap-y-2 text-[11px] text-slate-500 dark:text-gray-400'>
      <div>
        <p className='font-semibold uppercase tracking-wider text-slate-700 dark:text-gray-300'>
          Population coverage
        </p>
        <div className='mt-1 flex gap-3'>
          {(["low", "high", "none"] as const).map((t) => (
            <span key={t} className='inline-flex items-center gap-1'>
              <span className={`h-2 w-2 rounded-full ${TIER_STYLES[t].dot}`} />
              {t === "low" ? "< 25%" : t === "high" ? "≥ 25%" : "No impact"}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className='font-semibold uppercase tracking-wider text-slate-700 dark:text-gray-300'>
          Incident status
        </p>
        <div className='mt-1 flex gap-3'>
          <span className='inline-flex items-center gap-1'>
            <span className='h-3 border-l-2 border-dashed border-slate-500' />
            Ongoing
          </span>
          <span className='inline-flex items-center gap-1'>
            <span className='h-3 border-l-2 border-solid border-slate-500' />
            Closed
          </span>
        </div>
      </div>
    </div>
  );
}

const downloadCsv = (groups: Group[]) => {
  const blob = new Blob([toCsv(groups)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aggie-incident-timeline-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const Timeline = () => {
  const [showBars, setShowBars] = useState(true);
  const { prefs, formatTimeZone } = useFormatters();
  const timeZone = resolveTimeZone(prefs);
  const { data, isLoading, isError } = useQuery(["groups", "published"], getPublishedGroups, {
    staleTime: 60 * 1000,
  });

  const groups = useMemo(
    () => [...(data ?? [])].sort((a, b) => startTimeOf(b) - startTimeOf(a)),
    [data]
  );
  const ongoingCount = groups.filter(isOngoing).length;
  const getAsnInfo = useAsnLookup(groups);
  const { containerRef, nowRef, setDotRef, layout } = useTimelineLayout([groups, showBars]);

  const { bars, laneCount } = useMemo(
    () => (showBars ? computeBars(groups, layout) : { bars: [], laneCount: 0 }),
    [groups, layout, showBars]
  );
  const barsWidth = showBars ? Math.max(laneCount, 1) * LANE_WIDTH + BAR_AXIS_GAP : 0;

  let prevMonth: string | null = null;

  return (
    <div className='mx-auto max-w-5xl px-4 py-6'>
      <header className='text-center'>
        <h1 className='text-3xl font-semibold text-slate-900 dark:text-white'>Incident Timeline</h1>
        <div className='mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-gray-400'>
          <p>
            {groups.length} published incident{groups.length === 1 ? "" : "s"}
            {" · "}
            <span className='font-medium text-sky-700 dark:text-sky-300'>{ongoingCount} ongoing</span>
            {` · newest first · times in ${formatTimeZone(new Date())}`}
          </p>
          <label className='flex items-center gap-2 text-slate-700 dark:text-gray-300'>
            <AggieSwitch
              checked={showBars}
              onChange={() => setShowBars((v) => !v)}
              label='Show duration bars'
            />
            Duration bars
          </label>
          <button
            type='button'
            onClick={() => downloadCsv(groups)}
            disabled={!groups.length}
            className='flex items-center gap-1.5 rounded px-2 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700'
          >
            <FontAwesomeIcon icon={faFileExport} />
            Export CSV
          </button>
        </div>
      </header>

      {isLoading && <p className='mt-10 text-center text-slate-500'>Loading incidents…</p>}
      {isError && (
        <p className='mt-10 text-center text-red-600'>Couldn't load published incidents.</p>
      )}
      {!isLoading && !isError && groups.length === 0 && (
        <p className='mt-10 text-center italic text-slate-500'>
          No published incidents yet. Incidents appear here once their publication status is set
          to Published or Shared with Networks.
        </p>
      )}

      {groups.length > 0 && (
        <div ref={containerRef} className='relative mt-6'>
          {/* axis line from NOW to the oldest incident */}
          {layout && (
            <div
              className='absolute w-px bg-slate-300 dark:bg-slate-600'
              style={{
                left: layout.axisX,
                top: layout.nowY,
                height: Math.max(layout.lastY - layout.nowY + 24, 0),
              }}
            />
          )}
          {layout && showBars && <DurationBars bars={bars} axisX={layout.axisX} />}

          {/* NOW row + legend */}
          <div className='flex items-start gap-3'>
            <div className='w-16 shrink-0 pt-2 text-right text-xs font-bold uppercase text-[#2B7A8F] sm:w-24 dark:text-sky-300'>
              Now
            </div>
            <div className='shrink-0' style={{ width: barsWidth }} />
            <div className='flex w-4 shrink-0 justify-center pt-2'>
              <div
                ref={nowRef}
                className='relative h-3 w-3 rounded-full border-2 border-white bg-[#2B7A8F] ring-1 ring-[#2B7A8F] dark:border-gray-800'
              />
            </div>
            <div className='min-w-0 flex-1'>
              <Legend />
            </div>
          </div>

          {groups.map((g) => {
            const t = startTimeOf(g);
            const mk = monthKey(t, timeZone);
            const newMonth = mk !== prevMonth;
            prevMonth = mk;
            const tier = TIER_STYLES[incidentTier(g)];
            return (
              <Fragment key={g._id}>
                {newMonth && (
                  <div className='mt-4 flex items-center gap-3'>
                    <div className='w-16 shrink-0 text-right leading-tight sm:w-24'>
                      <p className='text-xs font-bold uppercase text-slate-700 dark:text-gray-200'>
                        {monthLabel(t, timeZone)}
                      </p>
                      <p className='text-[11px] text-slate-400'>{yearLabel(t, timeZone)}</p>
                    </div>
                    <div className='shrink-0' style={{ width: barsWidth }} />
                    <div className='flex w-4 shrink-0 justify-center'>
                      <div className='relative h-px w-4 bg-slate-500' />
                    </div>
                  </div>
                )}
                <div className='mt-3 flex items-start gap-3'>
                  <div className='w-16 shrink-0 sm:w-24' />
                  <div className='shrink-0' style={{ width: barsWidth }} />
                  <div className='flex w-4 shrink-0 justify-center pt-6'>
                    <div
                      ref={setDotRef(g._id)}
                      className={`relative h-3 w-3 rounded-full border-2 border-white dark:border-gray-800 ${tier.dot}`}
                    />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <TimelineCard group={g} getAsnInfo={getAsnInfo} />
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Timeline;
