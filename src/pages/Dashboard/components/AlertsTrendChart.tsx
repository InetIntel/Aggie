import { useEffect, useState } from "react";
import { useHref } from "react-router-dom";
import type { AnalyticsOverview } from "../../../api/analytics/types";
import { formatActivityWindow, formatXAxisLabel } from "../dashboardHelpers";

const fallbackTimeSeries = [
  "2026-02-26T10:00:00.000Z",
  "2026-02-26T10:30:00.000Z",
  "2026-02-26T11:00:00.000Z",
  "2026-02-26T11:30:00.000Z",
  "2026-02-26T12:00:00.000Z",
  "2026-02-26T12:30:00.000Z",
  "2026-02-26T13:00:00.000Z",
].map((bucketStart, index) => ({
  bucketStart,
  bucketEnd: new Date(new Date(bucketStart).getTime() + 30 * 60 * 1000).toISOString(),
  // totalReports: [8, 6, 7, 11, 14, 13, 9][index],
  totalReports: 0,
  notableActivityCount: 0,
  highConfidenceActivityCount: 0,
}));

const trendColor = "#F4C44E";

const sourceSeriesStyle =
  "[--trend-ioda:#2a78d6] dark:[--trend-ioda:#3987e5] " +
  "[--trend-cloudflare:#eb6834] dark:[--trend-cloudflare:#d95926] " +
  "[--trend-ooni:#1baf7a] dark:[--trend-ooni:#199e70] " +
  "[--trend-other:#6b7280] dark:[--trend-other:#9ca3af]";

const sourceSeriesMeta: Record<string, { label: string; color: string }> = {
  ioda: { label: "IODA", color: "var(--trend-ioda)" },
  cloudflare: { label: "Cloudflare", color: "var(--trend-cloudflare)" },
  ooni: { label: "OONI", color: "var(--trend-ooni)" },
};
const otherSourceColor = "var(--trend-other)";

const viewModes = [
  { key: "combined", label: "Combined" },
  { key: "bySource", label: "By source" },
] as const;
type ViewMode = (typeof viewModes)[number]["key"];

const chartFrame = {
  left: 30,
  top: 8,
  width: 620,
  height: 142,
};

const chartTooltipFontSize = 14;

const AlertsTrendChart = ({ overview }: { overview?: AnalyticsOverview }) => {
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [pinnedPointIndex, setPinnedPointIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("combined");

  useEffect(() => {
    setPinnedPointIndex(null);
  }, [overview?.rangePreset, overview?.bucketPreset]);

  useEffect(() => {
    if (pinnedPointIndex === null) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPinnedPointIndex(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pinnedPointIndex]);

  const timeSeries = overview?.timeSeries?.length
    ? overview.timeSeries
    : fallbackTimeSeries;

  const series = buildSeries(timeSeries, viewMode);
  const chartMax = Math.max(
    ...series.flatMap((line) => line.values),
    1
  );
  const yAxisTicks = getNiceYAxisTicks(chartMax);
  const yAxisMax = yAxisTicks[yAxisTicks.length - 1] || 1;
  const xAxisLabelIndexes = getXAxisLabelIndexes(timeSeries.length);
  const seriesCoords = series.map((line) => ({
    ...line,
    coords: line.values.map((value, index) => ({
      x: getChartX(index, timeSeries.length),
      y: getChartY(value, yAxisMax),
    })),
  }));

  const activePointIndex =
    pinnedPointIndex !== null && pinnedPointIndex < timeSeries.length
      ? pinnedPointIndex
      : hoveredPointIndex;
  const activeItem =
    activePointIndex === null ? null : timeSeries[activePointIndex] || null;
  const activePoint = activeItem
    ? {
        x: getChartX(activePointIndex as number, timeSeries.length),
        y: Math.min(
          ...seriesCoords.map((line) => line.coords[activePointIndex as number].y)
        ),
      }
    : null;
  const isActivePointPinned =
    activePointIndex !== null && activePointIndex === pinnedPointIndex;

  return (
    <div
      className={`mt-4 rounded-[1.5rem] border border-slate-200 px-2 py-4 dark:border-gray-700 sm:px-3 ${sourceSeriesStyle}`}
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-2xl font-medium text-sky-700'>Alert</h3>
          <p className='text-xs text-slate-500 dark:text-gray-400'>
            Click a point to view the reports in that time bucket
          </p>
          {/* <p className='text-sm text-slate-500 dark:text-gray-400'>
            {overview ? "Reports per time bucket" : "Static dashboard placeholder"}
          </p> */}
        </div>
        <div
          className='inline-flex shrink-0 rounded-full border border-slate-200 p-0.5 dark:border-gray-600'
          role='group'
          aria-label='Trend line grouping'
        >
          {viewModes.map((mode) => (
            <button
              key={mode.key}
              type='button'
              aria-pressed={viewMode === mode.key}
              onClick={() => setViewMode(mode.key)}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition",
                viewMode === mode.key
                  ? "bg-slate-700 text-white dark:bg-gray-600"
                  : "text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-700",
              ].join(" ")}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {/* <div className='rounded-full bg-slate-50 p-2 text-slate-500 shadow-sm dark:bg-gray-700'>
          <FontAwesomeIcon icon={faBell} />
        </div> */}
      </div>

      <div className='flex w-full justify-center'>
        <svg
          viewBox='0 0 660 215'
          className='block h-[185px] w-full'
          role='img'
          aria-label='Alert trends chart'
        >
          <rect
            x={chartFrame.left}
            y={chartFrame.top}
            width={chartFrame.width}
            height={chartFrame.height}
            fill='transparent'
            onClick={() => setPinnedPointIndex(null)}
          />
          {xAxisLabelIndexes.map((index) => (
            <line
              key={`v-${index}`}
              x1={getChartX(index, timeSeries.length)}
              y1={chartFrame.top}
              x2={getChartX(index, timeSeries.length)}
              y2={chartFrame.top + chartFrame.height}
              stroke='#E5E7EB'
            />
          ))}
          {yAxisTicks.map((tick) => (
            <line
              key={`h-${tick}`}
              x1={chartFrame.left}
              y1={getChartY(tick, yAxisMax)}
              x2={chartFrame.left + chartFrame.width}
              y2={getChartY(tick, yAxisMax)}
              stroke='#E5E7EB'
            />
          ))}

          {[...yAxisTicks].reverse().map((tick, index) => (
            <text
              key={`y-label-${tick}-${index}`}
              x={chartFrame.left - 8}
              y={getChartY(tick, yAxisMax) + 4}
              fill='#475569'
              fontSize='12'
              fontWeight='500'
              textAnchor='end'
            >
              {tick}
            </text>
          ))}

          <g>
            {seriesCoords.map((line) => (
              <polyline
                key={line.key}
                fill='none'
                stroke={line.color}
                strokeWidth='2.5'
                points={line.coords.map(({ x, y }) => `${x},${y}`).join(" ")}
              />
            ))}
            {activePoint && (
              <line
                x1={activePoint.x}
                y1={chartFrame.top}
                x2={activePoint.x}
                y2={chartFrame.top + chartFrame.height}
                stroke='#94A3B8'
                strokeDasharray='3 3'
              />
            )}
            {seriesCoords.map((line) =>
              line.coords.map(({ x, y }, index) => (
                <circle
                  key={`${line.key}-${timeSeries[index].bucketStart || index}`}
                  cx={x}
                  cy={y}
                  r={activePointIndex === index ? 6 : 4}
                  fill={line.color}
                  stroke={activePointIndex === index ? "#FFFFFF" : "none"}
                  strokeWidth={activePointIndex === index ? 2 : 0}
                />
              ))
            )}
            {/* One hit band per bucket, so every line in that bucket is reachable. */}
            {timeSeries.map((item, index) => {
              const x = getChartX(index, timeSeries.length);
              const bandWidth = Math.max(
                16,
                chartFrame.width / Math.max(timeSeries.length - 1, 1)
              );
              return (
                <rect
                  key={`hit-${item.bucketStart || index}`}
                  x={Math.max(x - bandWidth / 2, chartFrame.left)}
                  y={chartFrame.top}
                  width={bandWidth}
                  height={chartFrame.height}
                  fill='transparent'
                  className='cursor-pointer'
                  onMouseEnter={() => setHoveredPointIndex(index)}
                  onMouseLeave={() =>
                    setHoveredPointIndex((current) =>
                      current === index ? null : current
                    )
                  }
                  onClick={() =>
                    setPinnedPointIndex((current) =>
                      current === index ? null : index
                    )
                  }
                >
                  <title>
                    {buildTooltipLines(item, series, index).join(" — ")}
                  </title>
                </rect>
              );
            })}
          </g>

          {activePoint && activeItem && (
            <ChartTooltip
              point={activePoint}
              lines={buildTooltipLines(
                activeItem,
                series,
                activePointIndex as number
              )}
              hasReports={activeItem.totalReports > 0}
              isPinned={isActivePointPinned}
              reportsTo={buildBucketReportsTo(activeItem)}
              onClose={() => setPinnedPointIndex(null)}
            />
          )}

          {xAxisLabelIndexes.map((index) => {
            const item = timeSeries[index];
            const [dateLabel, timeLabel] = formatXAxisLabel(item.bucketStart);
            const x = getChartX(index, timeSeries.length);
            return (
              <text
                key={item.bucketStart}
                x={x}
                y='172'
                fill='#475569'
                fontSize='10'
                fontWeight='500'
                textAnchor='middle'
              >
                <tspan x={x} dy='0'>
                  {dateLabel}
                </tspan>
                <tspan x={x} dy='12'>
                  {timeLabel}
                </tspan>
              </text>
            );
          })}
        </svg>
      </div>

      <div className='mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-800 dark:text-gray-200'>
        {series.map((line) => (
          <div key={line.key} className='flex items-center gap-2'>
            <span
              className='h-3 w-3 rounded-full'
              style={{ backgroundColor: line.color }}
            />
            <span>{overview || viewMode === "bySource" ? line.label : " "}</span>
          </div>
        ))}
        {/* <div className='inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 dark:border-gray-600 dark:text-gray-200'>
          <span>{bucketLabels[bucket]}</span>
          <FontAwesomeIcon icon={faArrowTrendUp} className='text-slate-500' />
        </div> */}
      </div>
    </div>
  );
};

type TimeSeriesBucket = AnalyticsOverview["timeSeries"][number];
type ChartSeries = { key: string; label: string; color: string; values: number[] };

function buildSeries(
  timeSeries: TimeSeriesBucket[],
  viewMode: ViewMode
): ChartSeries[] {
  if (viewMode === "combined") {
    return [
      {
        key: "total",
        label: "Total reports",
        color: trendColor,
        values: timeSeries.map((item) => item.totalReports),
      },
    ];
  }

  const presentSources = new Set<string>();
  timeSeries.forEach((item) => {
    Object.entries(item.reportsBySource || {}).forEach(([source, count]) => {
      if (count > 0) presentSources.add(source);
    });
  });

  const orderedSources = [
    ...Object.keys(sourceSeriesMeta).filter((source) => presentSources.has(source)),
    ...[...presentSources].filter((source) => !sourceSeriesMeta[source]).sort(),
  ];

  if (orderedSources.length === 0) return buildSeries(timeSeries, "combined");

  return orderedSources.map((source) => ({
    key: source,
    label: sourceSeriesMeta[source]?.label || source,
    color: sourceSeriesMeta[source]?.color || otherSourceColor,
    values: timeSeries.map((item) => (item.reportsBySource || {})[source] || 0),
  }));
}

function buildTooltipLines(
  item: TimeSeriesBucket,
  series: ChartSeries[],
  index: number
) {
  const window = formatActivityWindow(item.bucketStart, item.bucketEnd);
  if (series.length === 1) {
    return [
      `${item.totalReports} report${item.totalReports === 1 ? "" : "s"}`,
      window,
    ];
  }
  return [
    `${item.totalReports} report${item.totalReports === 1 ? "" : "s"}`,
    ...series.map((line) => `${line.label}: ${line.values[index]}`),
    window,
  ];
}

// The alerts list filters outage reports on `outageStartedAt`, which is the same
// field the analytics buckets are built from — so this window reproduces exactly
// the reports counted by one point on the trend chart.
function buildBucketReportsTo(item: AnalyticsOverview["timeSeries"][number]) {
  const params = new URLSearchParams({
    outageAfter: new Date(item.bucketStart).toISOString(),
    outageBefore: new Date(item.bucketEnd).toISOString(),
    alerts: "true",
  });
  return `/alerts?${params.toString()}`;
}

function ChartTooltip({
  point,
  lines,
  hasReports,
  isPinned,
  reportsTo,
  onClose,
}: {
  point: { x: number; y: number };
  lines: string[];
  hasReports: boolean;
  isPinned: boolean;
  reportsTo: string;
  onClose: () => void;
}) {
  // Router-resolved so the link honours the PUBLIC_URL basename, like <Link> does.
  const reportsHref = useHref(reportsTo);
  const { x, y } = point;
  const actionLabel = "View Reports";
  const showAction = isPinned && hasReports;

  // All geometry is a multiple of the base font size so the box, the padding and
  // the action button grow together when `chartTooltipFontSize` changes.
  const fontSize = chartTooltipFontSize;
  const charWidth = fontSize * 0.52;
  const lineHeight = Math.round(fontSize * 1.35);
  const paddingX = Math.round(fontSize * 0.75);
  const paddingY = Math.round(fontSize * 0.5);
  const actionHeight = Math.round(fontSize * 2);
  const actionGap = Math.round(fontSize * 0.55);
  const closeSize = Math.round(fontSize * 1.3);

  const contentWidth = Math.max(
    Math.max(...lines.map((line) => line.length)) * charWidth,
    // Room for the close affordance next to the first (short) line.
    lines[0].length * charWidth + closeSize + paddingX,
    showAction ? actionLabel.length * charWidth * 1.15 : 0
  );
  const boxWidth = contentWidth + paddingX * 2;
  const boxHeight =
    paddingY * 2 +
    lineHeight * lines.length +
    (showAction ? actionHeight + actionGap : 0);
  const boxX = Math.min(
    Math.max(x - boxWidth / 2, chartFrame.left),
    chartFrame.left + chartFrame.width - boxWidth
  );
  const placeBelow = y - boxHeight - 12 < chartFrame.top;
  // Keep the box inside the plot area even when the taller pinned version would
  // otherwise spill onto the x-axis labels.
  const boxY = Math.min(
    placeBelow ? y + 12 : y - boxHeight - 12,
    chartFrame.top + chartFrame.height - boxHeight
  );
  const actionY = boxY + paddingY + lineHeight * lines.length + actionGap;

  return (
    <g pointerEvents={isPinned ? "auto" : "none"}>
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        rx='6'
        fill='#0F172AEE'
      />
      {lines.map((line, index) => (
        <text
          key={line}
          x={boxX + paddingX}
          y={boxY + paddingY + fontSize + index * lineHeight}
          fill='#FFFFFF'
          fontSize={fontSize}
          fontWeight={index === 0 ? "600" : "400"}
        >
          {line}
        </text>
      ))}
      {showAction && (
        <a href={reportsHref} target='_blank' rel='noopener noreferrer'>
          <rect
            x={boxX + paddingX}
            y={actionY}
            width={boxWidth - paddingX * 2}
            height={actionHeight}
            rx='4'
            fill='#334155'
            className='cursor-pointer'
          />
          <text
            x={boxX + boxWidth / 2}
            y={actionY + actionHeight / 2 + fontSize * 0.36}
            fill='#FFFFFF'
            fontSize={fontSize}
            fontWeight='600'
            textAnchor='middle'
            className='cursor-pointer'
          >
            {actionLabel}
          </text>
        </a>
      )}
      {isPinned && (
        <g className='cursor-pointer' onClick={onClose}>
          <rect
            x={boxX + boxWidth - paddingX - closeSize}
            y={boxY + paddingY - 2}
            width={closeSize}
            height={closeSize}
            rx='3'
            fill='transparent'
          />
          <text
            x={boxX + boxWidth - paddingX - closeSize / 2}
            y={boxY + paddingY + fontSize}
            fill='#CBD5E1'
            fontSize={fontSize * 1.15}
            textAnchor='middle'
          >
            &#215;
          </text>
        </g>
      )}
    </g>
  );
}

function getChartX(index: number, totalPoints: number) {
  if (totalPoints <= 1) return chartFrame.left + chartFrame.width / 2;
  return chartFrame.left + (chartFrame.width / (totalPoints - 1)) * index;
}

function getChartY(value: number, maxValue: number) {
  const normalizedValue = Math.min(Math.max(value / maxValue, 0), 1);
  return chartFrame.top + chartFrame.height - normalizedValue * chartFrame.height;
}

function getNiceYAxisTicks(maxValue: number) {
  const targetIntervals = 3;
  const safeMax = Math.max(maxValue, 1);
  const roughStep = safeMax / targetIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const niceMultiplier =
    normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;
  const step = Math.max(1, niceMultiplier * magnitude);
  const axisMax = Math.ceil(safeMax / step) * step;
  const ticks = [];

  for (let value = 0; value <= axisMax; value += step) {
    ticks.push(Number(value.toFixed(8)));
  }

  return ticks;
}

function getXAxisLabelIndexes(totalPoints: number) {
  if (totalPoints <= 1) return [0];
  const maxLabels = 7;
  if (totalPoints <= maxLabels) {
    return Array.from({ length: totalPoints }, (_, index) => index);
  }

  // Step by a whole number of buckets so gaps between labels are always equal,
  // and anchor on the newest bucket so the latest point is always labeled.
  const stride = Math.ceil((totalPoints - 1) / (maxLabels - 1));
  const indexes = [];

  for (let index = totalPoints - 1; index >= 0; index -= stride) {
    indexes.push(index);
  }

  return indexes.reverse();
}

export default AlertsTrendChart;
