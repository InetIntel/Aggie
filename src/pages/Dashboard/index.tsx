import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import {
  createNotableActivityIncident,
  getAnalyticsOverview,
  getNotableActivities,
  getReportMetrics,
} from "../../api/analytics";
import type {
  AnalyticsQueryState,
  AnalyticsUpdateEvent,
  AnalyticsBucketPreset,
  AnalyticsRangePreset,
  NotableActivity,
} from "../../api/analytics/types";
import {
  DEFAULT_START_TIME_TOLERANCE_MINUTES,
  START_TIME_TOLERANCE_OPTIONS,
} from "../../api/analytics/types";
import { SocketContext, SocketEvent, useSocketSubscribe } from "../../hooks/WebsocketProvider";
import AggieDialog from "../../components/AggieDialog";
import CreateEditIncidentForm from "../incidents/CreateEditIncidentForm";
import AlertsTrendChart from "./components/AlertsTrendChart";
import DashboardAddToIncident from "./components/DashboardAddToIncident";
import DashboardTimeControls, {
  BucketSizeToggle,
} from "./components/DashboardTimeControls";
import NotableActivityCard from "./components/NotableActivityCard";
import MetricsList from "./components/MetricsList";
import {
  addPickerDays,
  buildAnalyticsSocketQuery,
  getActivityLocationSummary,
  getAnalyticsRoom,
  getAnalyticsTimeZone,
  getCustomRangeBounds,
  getCustomRangeBuckets,
  toPickerDay,
  useDashboardFormatters,
} from "./dashboardHelpers";
import { formatTimeZone } from "../../utils/dateFormat";
import type { GroupEditableData } from "../../api/groups/types";

const sectionCardClass =
  "rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-gray-700 dark:bg-gray-800";

// Bucket sizes offered per preset; a custom range's depend on its length.
// Mirrors VALID_BUCKETS_BY_RANGE in backend/api/utils/analyticsTime.js.
const presetBuckets: Record<
  Exclude<AnalyticsRangePreset, "custom">,
  AnalyticsBucketPreset[]
> = {
  today: ["30m", "1h", "6h"],
  last24h: ["1h", "6h"],
  last7d: ["6h", "24h"],
};

// A custom range starts out as the last seven days, including today.
const DEFAULT_CUSTOM_RANGE_DAYS = 7;

function formatToleranceLabel(minutes: number) {
  if (minutes === 0) return "exact";
  return minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
}

// const maxNotableCards = 6;
const notableCardsPerPage = 12;

const Dashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { socket } = useContext(SocketContext);
  const {
    prefs,
    buildIncidentInitialValues,
    buildIncidentTitle,
    formatActivityWindow,
    formatCompactDateTime,
    formatRangeLabel,
  } = useDashboardFormatters();
  const [range, setRange] = useState<AnalyticsRangePreset>("last24h");
  const [customToDay, setCustomToDay] = useState(() => toPickerDay(new Date()));
  const [customFromDay, setCustomFromDay] = useState(() =>
    addPickerDays(toPickerDay(new Date()), -(DEFAULT_CUSTOM_RANGE_DAYS - 1))
  );
  const [bucket, setBucket] = useState<AnalyticsBucketPreset>("1h");
  const [tolerance, setTolerance] = useState<number>(
    DEFAULT_START_TIME_TOLERANCE_MINUTES
  );
  const [dismissedActivityKeys, setDismissedActivityKeys] = useState<string[]>([]);
  const [notablePage, setNotablePage] = useState(0);
  const [activityToPromote, setActivityToPromote] = useState<NotableActivity | null>(
    null
  );
  const [activityToLink, setActivityToLink] = useState<NotableActivity | null>(null);

  useEffect(() => {
    document.title = "Dashboard - Aggie";
    document.getElementById("main_view")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, []);

  // One window for the whole page — metrics, chart and cards — laid out in the zone the
  // user reads times in, so a 24h bucket runs midnight to midnight for them.
  const timeZone = getAnalyticsTimeZone(prefs);
  const customBounds = useMemo(
    () => getCustomRangeBounds(customFromDay, customToDay, prefs),
    [customFromDay, customToDay, prefs]
  );
  const windowParams: AnalyticsQueryState = useMemo(
    () =>
      range === "custom"
        ? { range, ...customBounds, timeZone }
        : { range, timeZone },
    [range, customBounds, timeZone]
  );
  const bucketOptions = useMemo(
    () =>
      range === "custom"
        ? getCustomRangeBuckets(customBounds.from, customBounds.to)
        : presetBuckets[range],
    [range, customBounds]
  );
  // Until the effect below reconciles it, never send a bucket the range does not offer.
  const activeBucket = bucketOptions.includes(bucket) ? bucket : bucketOptions[0];

  useEffect(() => {
    if (!bucketOptions.includes(bucket)) {
      setBucket(bucketOptions[0]);
    }
  }, [bucket, bucketOptions]);

  useEffect(() => {
    setNotablePage(0);
  }, [windowParams, tolerance]);

  // The chart counts reports on the fixed bucket grid, while the cards group reports
  // whose outages started within `tolerance` of each other. Each grouping gets its own
  // request (and cache key); both share the window.
  const overviewParams: AnalyticsQueryState = {
    ...windowParams,
    bucket: activeBucket,
    aggregation: "bucket",
  };
  // Start-time grouping ignores the grid, but the backend still validates a bucket and
  // keys its cache on it. A fixed one per range keeps the chart's bucket toggle from
  // refetching (and re-caching) identical cards.
  const notableParams: AnalyticsQueryState = {
    ...windowParams,
    bucket: bucketOptions[0],
    aggregation: "startTime",
    tolerance,
  };

  const overviewQuery = useQuery({
    queryKey: ["analytics", "overview", overviewParams],
    queryFn: () => getAnalyticsOverview(overviewParams),
    keepPreviousData: true,
  });

  const notableActivitiesQuery = useQuery({
    queryKey: ["analytics", "notable-activities", notableParams],
    queryFn: () => getNotableActivities(notableParams),
    keepPreviousData: true,
  });

  // Metrics follow the same window the rest of the dashboard is showing.
  const reportMetricsQuery = useQuery({
    queryKey: ["analytics", "report-metrics", windowParams],
    queryFn: () => getReportMetrics(windowParams),
    keepPreviousData: true,
  });

  const createIncidentMutation = useMutation({
    mutationFn: createNotableActivityIncident,
    onSuccess: (group) => {
      setActivityToPromote(null);
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      if (group?._id) {
        navigate(`/incidents/${group._id}`);
      }
    },
  });

  const overviewCacheKey = overviewQuery.data?.cacheKey;
  const notableCacheKey = notableActivitiesQuery.data?.cacheKey;

  const handleAnalyticsUpdate = useCallback(
    (message: (SocketEvent & { data: AnalyticsUpdateEvent }) | AnalyticsUpdateEvent) => {
      const payload = "data" in message && "event" in message ? message.data : message;
      if (!payload?.cacheKey) return;

      const isOverview = payload.cacheKey === overviewCacheKey;
      const isNotable = payload.cacheKey === notableCacheKey;
      if (!isOverview && !isNotable) return;

      // Only active queries refetch, so the prefix reaches just the one on screen.
      if (isOverview) {
        queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] });
      }
      if (isNotable) {
        queryClient.invalidateQueries({ queryKey: ["analytics", "notable-activities"] });
      }
      queryClient.invalidateQueries({ queryKey: ["analytics", "report-metrics"] });
    },
    [overviewCacheKey, notableCacheKey, queryClient]
  );

  useSocketSubscribe("analytics:update", handleAnalyticsUpdate);

  // Subscribe the chart's and the cards' results together: the server replaces a
  // socket's whole subscription set with each "analytics" message.
  useEffect(() => {
    if (!socket) return;
    const subscriptions = [overviewQuery.data, notableActivitiesQuery.data]
      .filter((data): data is NonNullable<typeof data> => !!data?.cacheKey)
      .map(buildAnalyticsSocketQuery);
    if (!subscriptions.length) return;

    const rooms = Array.from(
      new Set(subscriptions.map((query) => getAnalyticsRoom(query.cacheKey)))
    );
    rooms.forEach((room) => socket.emit("join", room));
    socket.emit("analytics", subscriptions);

    return () => {
      rooms.forEach((room) => socket.emit("leave", room));
      socket.emit("analytics", null);
    };
  }, [overviewQuery.data, notableActivitiesQuery.data, socket]);

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

  function createIncidentFromActivity(values: Partial<GroupEditableData>) {
    const cacheKey = notableActivitiesQuery.data?.cacheKey;
    if (!cacheKey || !activityToPromote) return;

    createIncidentMutation.mutate({
      cacheKey,
      eventAggKey: activityToPromote.eventAggKey,
      group: {
        ...values,
        title: values.title || buildIncidentTitle(activityToPromote),
      },
    });
  }

  return (
    <section className='mx-auto max-w-[1400px] px-4 py-6'>
      <DashboardTimeControls
        range={range}
        onRangeChange={setRange}
        customFromDay={customFromDay}
        customToDay={customToDay}
        onCustomFromDayChange={(day) => setCustomFromDay(toPickerDay(new Date(day)))}
        onCustomToDayChange={(day) => setCustomToDay(toPickerDay(new Date(day)))}
        timeZoneLabel={formatTimeZone(new Date(), prefs)}
      />

      <div className='grid gap-4 xl:grid-cols-[1fr_1.15fr]'>
        <section className={`${sectionCardClass} flex h-full flex-col p-4`}>
          <h1 className='text-xl font-semibold text-slate-900 dark:text-white'>
            Metrics
          </h1>
          <MetricsList
            data={reportMetricsQuery.data}
            isLoading={reportMetricsQuery.isLoading}
          />
        </section>

        <section className={`${sectionCardClass} p-4`}>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <h2 className='text-xl font-semibold text-slate-900 dark:text-white'>
              Trends
            </h2>
            <BucketSizeToggle
              bucket={activeBucket}
              bucketOptions={bucketOptions}
              onBucketChange={setBucket}
            />
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

          <AlertsTrendChart overview={overviewQuery.data} />
        </section>
      </div>

      <section className={`${sectionCardClass} mt-5`}>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 className='text-xl font-semibold text-slate-900 dark:text-white'>
            Notable Activity
          </h2>
          <div className='flex flex-wrap items-center gap-3'>
            <label className='inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-gray-200'>
              <span>Start-time tolerance</span>
              <select
                value={tolerance}
                onChange={(event) => setTolerance(Number(event.target.value))}
                title='Largest gap between consecutive outage starts that still counts as one activity'
                className='cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
              >
                {START_TIME_TOLERANCE_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatToleranceLabel(minutes)}
                  </option>
                ))}
              </select>
            </label>
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

        <div className='mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {paginatedLiveNotableActivities.map((activity) => (
            <NotableActivityCard
              key={activity.eventAggKey}
              activity={activity}
              cacheKey={notableActivitiesQuery.data?.cacheKey || ""}
              onDismiss={() => dismissActivity(activity.eventAggKey)}
              onCreateIncident={() => setActivityToPromote(activity)}
              onAddToIncident={() => setActivityToLink(activity)}
              isCreatingIncident={
                createIncidentMutation.isLoading &&
                activityToPromote?.eventAggKey === activity.eventAggKey
              }
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

      <AggieDialog
        isOpen={!!activityToPromote}
        onClose={() => {
          if (!createIncidentMutation.isLoading) setActivityToPromote(null);
        }}
        data={{ title: "Create Incident" }}
        className='w-full max-w-2xl p-5'
      >
        {activityToPromote && (
          <div className='max-h-[78vh] overflow-y-auto pr-1'>
            <div className='mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'>
              <div className='font-medium text-slate-900 dark:text-white'>
                {formatActivityWindow(
                  activityToPromote.bucketStart,
                  activityToPromote.bucketEnd
                )}
              </div>
              <div className='mt-1 flex flex-wrap gap-x-4 gap-y-1'>
                <span>{activityToPromote.totalReports} reports</span>
                <span>{activityToPromote.sourceCnt} sources</span>
                <span>{activityToPromote.signalCnt} signals</span>
              </div>
            </div>
            <CreateEditIncidentForm
              initialValues={buildIncidentInitialValues(activityToPromote)}
              onSubmit={createIncidentFromActivity}
              onCancel={() => {
                if (!createIncidentMutation.isLoading) setActivityToPromote(null);
              }}
              isLoading={createIncidentMutation.isLoading}
            />
          </div>
        )}
      </AggieDialog>

      <DashboardAddToIncident
        isOpen={!!activityToLink}
        activity={activityToLink}
        cacheKey={notableActivitiesQuery.data?.cacheKey || ""}
        windowLabel={
          activityToLink
            ? formatActivityWindow(activityToLink.bucketStart, activityToLink.bucketEnd)
            : ""
        }
        locationLabel={
          activityToLink ? getActivityLocationSummary(activityToLink) : ""
        }
        onClose={() => setActivityToLink(null)}
      />
    </section>
  );
};

export default Dashboard;
