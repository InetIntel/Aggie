import { useCallback, useContext, useEffect, useState } from "react";
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
import DashboardTimeControls from "./components/DashboardTimeControls";
import NotableActivityCard from "./components/NotableActivityCard";
import MetricsList, { HeadlineMetrics } from "./components/MetricsList";
import {
  buildAnalyticsSocketQuery,
  getActivityLocationSummary,
  getAnalyticsRoom,
  useAnalyticsWindow,
  useDashboardFormatters,
} from "./dashboardHelpers";
import type { AnalyticsWindow } from "./dashboardHelpers";
import { formatTimeZone } from "../../utils/dateFormat";
import type { GroupEditableData } from "../../api/groups/types";

const sectionTitleClass =
  "text-lg font-bold uppercase tracking-wide text-slate-900 dark:text-white";

const sectionCardClass =
  "rounded-md border border-[#C5D9E2] bg-white p-5 dark:border-slate-600 dark:bg-gray-800";

// A card's title on the left and its own range picker on the right. In a narrow card the
// picker wraps under the title.
function CardHeader({
  title,
  timeWindow,
}: {
  title: string;
  timeWindow: AnalyticsWindow;
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
      <h2 className={sectionTitleClass}>{title}</h2>
      <DashboardTimeControls timeWindow={timeWindow} className='ml-auto' />
    </div>
  );
}

// Each metrics card asks for its own window; equal windows share one cached request.
function useReportMetricsQuery(params: AnalyticsQueryState) {
  return useQuery({
    queryKey: ["analytics", "report-metrics", params],
    queryFn: () => getReportMetrics(params),
    keepPreviousData: true,
  });
}

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
  // Every card picks its own time range.
  const glanceWindow = useAnalyticsWindow(prefs);
  const alertsWindow = useAnalyticsWindow(prefs);
  const socialWindow = useAnalyticsWindow(prefs);
  const trendsWindow = useAnalyticsWindow(prefs);
  const notableWindow = useAnalyticsWindow(prefs);
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

  useEffect(() => {
    setNotablePage(0);
  }, [notableWindow.params, tolerance]);

  // The chart counts reports on the fixed bucket grid, while the cards group reports
  // whose outages started within `tolerance` of each other. Each grouping gets its own
  // request (and cache key) over its own card's window.
  const overviewParams: AnalyticsQueryState = {
    ...trendsWindow.params,
    bucket: trendsWindow.bucket,
    aggregation: "bucket",
  };
  // Start-time grouping ignores the grid, but the backend still validates a bucket and
  // keys its cache on it.
  const notableParams: AnalyticsQueryState = {
    ...notableWindow.params,
    bucket: notableWindow.bucket,
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

  const glanceMetricsQuery = useReportMetricsQuery(glanceWindow.params);
  const alertsMetricsQuery = useReportMetricsQuery(alertsWindow.params);
  const socialMetricsQuery = useReportMetricsQuery(socialWindow.params);
  const metricCategoryCards = [
    { key: "alerts", title: "Alerts", timeWindow: alertsWindow, query: alertsMetricsQuery },
    {
      key: "social",
      title: "Social Media Posts",
      timeWindow: socialWindow,
      query: socialMetricsQuery,
    },
  ] as const;

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
      <p
        className='mb-2 text-right text-xs text-slate-500 dark:text-gray-400'
        title='Set in your profile under display preferences'
      >
        Times in {formatTimeZone(new Date(), prefs)}
      </p>

      <section className={`${sectionCardClass} mb-5 p-4`}>
        <CardHeader title='Reports at a glance' timeWindow={glanceWindow} />
        <div className='mt-3'>
          <HeadlineMetrics
            data={glanceMetricsQuery.data}
            isLoading={glanceMetricsQuery.isLoading}
          />
        </div>
      </section>

      <div className='grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]'>
        <div className='grid content-start gap-5 sm:grid-cols-2 xl:grid-cols-1'>
          {metricCategoryCards.map(({ key, title, timeWindow, query }) => (
            <section key={key} className={`${sectionCardClass} p-4`}>
              <CardHeader title={title} timeWindow={timeWindow} />
              <div className='mt-3'>
                <MetricsList
                  category={query.data?.categories.find(
                    (category) => category.key === key
                  )}
                  isLoading={query.isLoading}
                />
              </div>
            </section>
          ))}
        </div>

        <div className='flex min-w-0 flex-col gap-5'>
          <section className={`${sectionCardClass} p-4`}>
            <CardHeader title='Trends' timeWindow={trendsWindow} />

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

            <div className='mt-4 grid gap-4 md:grid-cols-2'>
              <AlertsTrendChart overview={overviewQuery.data} variant='total' />
              <AlertsTrendChart overview={overviewQuery.data} variant='bySource' />
            </div>
          </section>

        <section className={`${sectionCardClass} p-4`}>
          <CardHeader title='Notable Activity' timeWindow={notableWindow} />
          <div className='mt-3 flex flex-wrap items-center justify-end gap-3'>
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

          <div className='mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
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
        </div>
      </div>

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
