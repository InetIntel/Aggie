import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faChevronLeft,
  faChevronRight,
  faLink,
  faPlus,
  faRotateLeft,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { getAnalyticsOverview, getNotableActivities } from "../api/analytics";
import type {
  AnalyticsBucketPreset,
  AnalyticsOverview,
  AnalyticsRangePreset,
  NotableActivity,
} from "../api/analytics/types";

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
  totalReports:[][index],
  notableActivityCount: 0,
  highConfidenceActivityCount: 0,
}));

const sectionCardClass =
  "rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-gray-700 dark:bg-gray-800";

const rangeOptions: {
  label: string;
  value: AnalyticsRangePreset;
  buckets: AnalyticsBucketPreset[];
}[] = [
  { label: "Today", value: "today", buckets: ["30m", "1h", "6h"] },
  { label: "Last 24h", value: "last24h", buckets: ["30m", "1h", "6h"] },
  { label: "Last 7d", value: "last7d", buckets: ["6h", "24h"] },
];

const bucketLabels: Record<AnalyticsBucketPreset, string> = {
  "30m": "30m",
  "1h": "1h",
  "6h": "6h",
  "24h": "24h",
};

const trendColor = "#F4C44E";
// const maxNotableCards = 6;
const notableCardsPerPage = 9;
const chartFrame = {
  left: 30,
  top: 8,
  width: 620,
  height: 142,
};

const Dashboard = () => {
  const [range, setRange] = useState<AnalyticsRangePreset>("today");
  const [bucket, setBucket] = useState<AnalyticsBucketPreset>("1h");
  const [dismissedActivityKeys, setDismissedActivityKeys] = useState<string[]>([]);
  const [notablePage, setNotablePage] = useState(0);

  useEffect(() => {
    document.title = "Dashboard - Aggie";
    document.getElementById("main_view")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, []);

  const selectedRange = useMemo(
    () => rangeOptions.find((option) => option.value === range) || rangeOptions[0],
    [range]
  );

  useEffect(() => {
    if (!selectedRange.buckets.includes(bucket)) {
      setBucket(selectedRange.buckets[0]);
    }
  }, [bucket, selectedRange]);

  useEffect(() => {
    setNotablePage(0);
  }, [range, bucket]);

  const overviewQuery = useQuery({
    queryKey: ["analytics", "overview", range, bucket],
    queryFn: () => getAnalyticsOverview({ range, bucket }),
    keepPreviousData: true,
  });

  const notableActivitiesQuery = useQuery({
    queryKey: ["analytics", "notable-activities", range, bucket],
    queryFn: () => getNotableActivities({ range, bucket }),
    keepPreviousData: true,
  });

  const metricItems = overviewQuery.data
    ? [
        {
          label: "Notable activities",
          value: overviewQuery.data.metrics.notableActivityCount,
          ring: true,
        },
        {
          label: "High confidence",
          value: overviewQuery.data.metrics.highConfidenceActivityCount,
        },
        {
          label: "Total reports",
          value: overviewQuery.data.metrics.totalReports,
        },
      ]
    : [];

  const timeSeries = overviewQuery.data?.timeSeries?.length
    ? overviewQuery.data.timeSeries
    : fallbackTimeSeries;

  const chartMax = Math.max(...timeSeries.map((item) => item.totalReports), 1);
  const yAxisTicks = getNiceYAxisTicks(chartMax);
  const yAxisMax = yAxisTicks[yAxisTicks.length - 1] || 1;
  const chartPoints = timeSeries
    .map((item, index) => {
      const x = getChartX(index, timeSeries.length);
      const y = getChartY(item.totalReports, yAxisMax);
      return `${x},${y}`;
    })
    .join(" ");
  const xAxisLabelIndexes = getXAxisLabelIndexes(timeSeries.length);

  const liveNotableActivities = notableActivitiesQuery.data?.notableActivities || [];
  const visibleLiveNotableActivities = liveNotableActivities.filter(
    (activity) => !dismissedActivityKeys.includes(activity.eventAggKey)
  );
  const activeNotableActivityCount = visibleLiveNotableActivities.length;
  const notablePageCount = Math.max(
    1,
    Math.ceil(activeNotableActivityCount / notableCardsPerPage)
  );
  const currentNotablePage = Math.min(notablePage, notablePageCount - 1);
  const notablePageStart = currentNotablePage * notableCardsPerPage;
  const paginatedLiveNotableActivities = visibleLiveNotableActivities.slice(
    notablePageStart,
    notablePageStart + notableCardsPerPage
  );
  const notableShowingStart =
    activeNotableActivityCount === 0 ? 0 : notablePageStart + 1;
  const notableShowingEnd = Math.min(
    notablePageStart + notableCardsPerPage,
    activeNotableActivityCount
  );
  const hasDismissedActivities = dismissedActivityKeys.length > 0;

  useEffect(() => {
    if (notablePage >= notablePageCount) {
      setNotablePage(notablePageCount - 1);
    }
  }, [notablePage, notablePageCount]);

  function dismissActivity(activityKey: string) {
    setDismissedActivityKeys((currentKeys) =>
      currentKeys.includes(activityKey) ? currentKeys : [...currentKeys, activityKey]
    );
  }

  return (
    <section className='mx-auto max-w-[1400px] px-4 py-6'>
      <div className='grid gap-4 xl:grid-cols-[1fr_1.15fr]'>
        <section className={`${sectionCardClass} flex h-full flex-col p-4`}>
          <h1 className='text-xl font-semibold text-slate-900 dark:text-white'>
            Metrics
          </h1>
          <div className='flex flex-1 flex-wrap content-center items-center justify-center gap-5 py-4'>
            {metricItems.length > 0 ? (
              metricItems.map((item) => (
                <article
                  key={item.label}
                  className={[
                    "flex h-36 w-36 flex-col items-center justify-center rounded-full border bg-white px-3 text-center shadow-[0_6px_12px_rgba(15,23,42,0.12)] dark:bg-gray-800",
                    item.ring
                      ? "border-[14px] border-[#166534]"
                      : "border-slate-200 dark:border-gray-600",
                  ].join(" ")}
                >
                  <p className='max-w-[8rem] text-lg font-medium leading-tight text-slate-900 dark:text-white'>
                    {item.label}
                  </p>
                  <p className='mt-2 text-2xl font-semibold text-[#166534]'>
                    {item.value}
                  </p>
                </article>
              ))
            ) : (
              <p className='text-sm text-slate-500 dark:text-gray-400'>
                Loading metrics
              </p>
            )}
          </div>
        </section>

        <section className={`${sectionCardClass} p-4`}>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <h2 className='text-xl font-semibold text-slate-900 dark:text-white'>
              Trends
            </h2>
            <div className='flex flex-wrap items-center justify-end gap-2'>
              <div className='inline-flex rounded-full border border-slate-200 p-1 dark:border-gray-600'>
                {rangeOptions.map((option) => (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => setRange(option.value)}
                    className={[
                      "rounded-full px-3 py-1.5 text-xs font-medium transition",
                      range === option.value
                        ? "bg-[#166534] text-white"
                        : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-700",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className='inline-flex rounded-full border border-slate-200 p-1 dark:border-gray-600'>
                {selectedRange.buckets.map((bucketOption) => (
                  <button
                    key={bucketOption}
                    type='button'
                    onClick={() => setBucket(bucketOption)}
                    className={[
                      "rounded-full px-3 py-1.5 text-xs font-medium transition",
                      bucket === bucketOption
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-700",
                    ].join(" ")}
                  >
                    {bucketLabels[bucketOption]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className='mt-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-gray-400'>
            <span>
              {overviewQuery.data
                ? `Showing ${formatRangeLabel(overviewQuery.data)}`
                : "Loading trend data"}
            </span>
            <span>
              {overviewQuery.isFetching
                ? "Refreshing..."
                : overviewQuery.isError
                  ? "Live data unavailable"
                  : overviewQuery.data
                    ? `Updated ${formatCompactDateTime(overviewQuery.data.computedAt)}`
                    : ""}
            </span>
          </div>

          <div className='mt-4 rounded-[1.5rem] border border-slate-200 px-2 py-4 dark:border-gray-700 sm:px-3'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <div>
                <h3 className='text-2xl font-medium text-sky-700'>Alert</h3>
                {/* <p className='text-sm text-slate-500 dark:text-gray-400'>
                  {overviewQuery.data ? "Reports per time bucket" : "Static dashboard placeholder"}
                </p> */}
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
                />
                {[0, 1, 2, 3, 4, 5, 6].map((line) => (
                  <line
                    key={`v-${line}`}
                    x1={chartFrame.left + (chartFrame.width / 6) * line}
                    y1={chartFrame.top}
                    x2={chartFrame.left + (chartFrame.width / 6) * line}
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
                  <polyline
                    fill='none'
                    stroke={trendColor}
                    strokeWidth='2.5'
                    points={chartPoints}
                  />
                  {chartPoints.split(" ").map((point, index) => {
                    const [cx, cy] = point.split(",");
                    return (
                      <circle
                        key={`${timeSeries[index]?.bucketStart || index}-${point}`}
                        cx={cx}
                        cy={cy}
                        r='4'
                        fill={trendColor}
                      />
                    );
                  })}
                </g>

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
              <div className='flex items-center gap-2'>
                <span
                  className='h-3 w-3 rounded-full'
                  style={{ backgroundColor: trendColor }}
                />
                <span>{overviewQuery.data ? "Total reports" : " "}</span>
              </div>
              {/* <div className='inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 dark:border-gray-600 dark:text-gray-200'>
                <span>{bucketLabels[bucket]}</span>
                <FontAwesomeIcon icon={faArrowTrendUp} className='text-slate-500' />
              </div> */}
            </div>
          </div>
        </section>
      </div>

      <section className={`${sectionCardClass} mt-5`}>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 className='text-xl font-semibold text-slate-900 dark:text-white'>
            Notable Activity
          </h2>
          <div className='flex items-center gap-3'>
            <button
              type='button'
              onClick={() => {
                setDismissedActivityKeys([]);
                setNotablePage(0);
              }}
              disabled={!hasDismissedActivities}
              className='inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              <span>Reset</span>
            </button>
            <p className='text-xs text-slate-500 dark:text-gray-400'>
              {notableActivitiesQuery.data
                ? `Showing ${notableShowingStart}-${notableShowingEnd} of ${activeNotableActivityCount} activities`
                : "Loading activities"}
            </p>
          </div>
        </div>

        <div className='mt-5 grid gap-4 xl:grid-cols-3'>
          {paginatedLiveNotableActivities.map((activity) => (
            <NotableActivityCard
              key={activity.eventAggKey}
              activity={activity}
              onDismiss={() => dismissActivity(activity.eventAggKey)}
            />
          ))}
        </div>

        {notableActivitiesQuery.data && activeNotableActivityCount === 0 && (
          <p className='mt-5 rounded-md border border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400'>
            No notable activities found.
          </p>
        )}

        {notablePageCount > 1 && (
          <div className='mt-5 flex flex-wrap items-center justify-center gap-3'>
            <button
              type='button'
              onClick={() => setNotablePage((page) => Math.max(page - 1, 0))}
              disabled={currentNotablePage === 0}
              className='inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
            >
              <FontAwesomeIcon icon={faChevronLeft} />
              <span>Previous</span>
            </button>
            <span className='text-sm font-medium text-slate-700 dark:text-gray-200'>
              Page {currentNotablePage + 1} of {notablePageCount}
            </span>
            <button
              type='button'
              onClick={() =>
                setNotablePage((page) => Math.min(page + 1, notablePageCount - 1))
              }
              disabled={currentNotablePage >= notablePageCount - 1}
              className='inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
            >
              <span>Next</span>
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        )}
      </section>
    </section>
  );
};

function NotableActivityCard({
  activity,
  onDismiss,
}: {
  activity: NotableActivity;
  onDismiss: () => void;
}) {
  const locationSummary = [activity.asn, activity.geoScope].filter(Boolean).join(" / ");

  return (
    <article className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800'>
      <div className='flex items-start justify-between gap-3'>
        <span
          className={[
            "inline-flex items-center rounded-full px-4 py-1 text-sm font-medium",
            activity.isHighConfidence
              ? "border border-red-300 bg-red-100 text-red-700"
              : "border border-amber-300 bg-amber-100 text-amber-700",
          ].join(" ")}
        >
          {activity.isHighConfidence ? "High" : "Medium"}
        </span>
        <button
          type='button'
          onClick={onDismiss}
          className='grid h-10 w-10 place-items-center rounded-full bg-white text-xl text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.16)] transition hover:bg-slate-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          aria-label='Dismiss activity card'
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <p className='mt-6 text-base font-semibold leading-tight text-slate-950 dark:text-white'>
        {formatActivityWindow(activity.bucketStart, activity.bucketEnd)}
      </p>
      <p className='mt-3 text-xl italic text-slate-700 dark:text-gray-300'>
        {locationSummary || "Location details unavailable"}
      </p>

      <div className='my-5 h-px bg-slate-200 dark:bg-gray-700' />

      <div>
        <p className='text-lg font-medium text-slate-900 dark:text-white'>
          Aggregation
        </p>
        <div className='mt-3 flex flex-wrap gap-2'>
          <span className='rounded-full border border-lime-400 bg-lime-100 px-3 py-1 text-sm text-slate-700'>
            {activity.sourceCnt} source{activity.sourceCnt === 1 ? "" : "s"}
          </span>
          <span className='rounded-full border border-lime-400 bg-lime-100 px-3 py-1 text-sm text-slate-700'>
            {activity.signalCnt} signal{activity.signalCnt === 1 ? "" : "s"}
          </span>
          <span className='rounded-full border border-lime-400 bg-lime-100 px-3 py-1 text-sm text-slate-700'>
            {activity.totalReports} report{activity.totalReports === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* <div className='my-5 h-px bg-slate-200 dark:bg-gray-700' />

      <div>
        <p className='text-lg font-medium text-slate-900 dark:text-white'>
          Incident
        </p>
        <div className='mt-3 flex flex-wrap gap-2'>
          <span
            className={[
              "rounded-full px-3 py-1 text-sm",
              activity.incidentId
                ? "border border-lime-400 bg-lime-100 text-slate-700"
                : "bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-gray-400",
            ].join(" ")}
          >
            {activity.incidentId ? "Linked to incident" : "No linked incident"}
          </span>
        </div>
      </div> */}

      <div className='my-5 h-px bg-slate-200 dark:bg-gray-700' />
{/* 
      <div className='flex items-center gap-3 text-sm text-slate-700 dark:text-gray-300'>
        <FontAwesomeIcon icon={faCircleExclamation} />
        <span>{locationSummary || "Location details unavailable"}</span>
      </div> */}

      <div className='mt-5 flex flex-col gap-3'>
        {activity.incidentId ? (
          <Link
            to={`/incidents/${activity.incidentId}`}
            className='flex w-full items-center justify-center gap-2 rounded-md bg-[#1683A3] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#126b85]'
          >
            <FontAwesomeIcon icon={faLink} />
            <span>Open Linked Incident</span>
          </Link>
        ) : (
          <Link
            to={`/incidents/new?reports=${activity.reportIds.join(":")}`}
            className='flex w-full items-center justify-center gap-2 rounded-md bg-[#166534] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#14532d]'
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>Create New Incident</span>
          </Link>
        )}
        <Link
          to={`/alerts?list=${activity.reportIds.join(",")}&alerts=true`}
          className='flex w-full items-center justify-center gap-2 rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800'
        >
          <FontAwesomeIcon icon={faBell} />
          <span>View Related Reports</span>
        </Link>
      </div>
    </article>
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
  const labelCount = Math.min(totalPoints, maxLabels);
  const indexes = new Set<number>();

  for (let labelIndex = 0; labelIndex < labelCount; labelIndex += 1) {
    indexes.add(Math.round((labelIndex * (totalPoints - 1)) / (labelCount - 1)));
  }

  return [...indexes].sort((a, b) => a - b);
}

function formatXAxisLabel(value: string) {
  const date = new Date(value);
  return [
    `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
    date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).toLowerCase(),
  ];
}

function formatActivityWindow(start: string, end: string) {
  const [startDate, startTime] = formatXAxisLabel(start);
  const [endDate, endTime] = formatXAxisLabel(end);

  return startDate === endDate
    ? `${startDate}, ${startTime} - ${endTime} UTC`
    : `${startDate} ${startTime} - ${endDate} ${endTime} UTC`;
}

function formatCompactDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRangeLabel(overview: AnalyticsOverview) {
  return `${formatCompactDateTime(overview.rangeStartUtc)} to ${formatCompactDateTime(
    overview.rangeEndUtc
  )}`;
}

export default Dashboard;
