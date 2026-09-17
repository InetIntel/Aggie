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
  AnalyticsSocketQuery,
  AnalyticsUpdateEvent,
  AnalyticsBucketPreset,
  AnalyticsRangePreset,
  NotableActivity,
} from "../../api/analytics/types";
import { SocketContext, SocketEvent, useSocketSubscribe } from "../../hooks/WebsocketProvider";
import AggieDialog from "../../components/AggieDialog";
import CreateEditIncidentForm from "../incidents/CreateEditIncidentForm";
import AlertsTrendChart from "./components/AlertsTrendChart";
import DashboardAddToIncident from "./components/DashboardAddToIncident";
import NotableActivityCard from "./components/NotableActivityCard";
import MetricsList from "./components/MetricsList";
import {
  buildIncidentInitialValues,
  buildIncidentTitle,
  formatActivityWindow,
  formatCompactDateTime,
  formatRangeLabel,
  getActivityLocationSummary,
  getAnalyticsRoom,
} from "./dashboardHelpers";
import type { GroupEditableData } from "../../api/groups/types";

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

// const maxNotableCards = 6;
const notableCardsPerPage = 12;

const Dashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { socket } = useContext(SocketContext);
  const [range, setRange] = useState<AnalyticsRangePreset>("today");
  const [bucket, setBucket] = useState<AnalyticsBucketPreset>("1h");
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

  const reportMetricsQuery = useQuery({
    queryKey: ["analytics", "report-metrics", range],
    queryFn: () => getReportMetrics({ range }),
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

  const handleAnalyticsUpdate = useCallback(
    (message: (SocketEvent & { data: AnalyticsUpdateEvent }) | AnalyticsUpdateEvent) => {
      const payload = "data" in message && "event" in message ? message.data : message;
      if (!payload?.cacheKey) return;
      if (payload.cacheKey !== notableActivitiesQuery.data?.cacheKey) return;

      queryClient.invalidateQueries({ queryKey: ["analytics", "overview", range, bucket] });
      queryClient.invalidateQueries({
        queryKey: ["analytics", "notable-activities", range, bucket],
      });
      queryClient.invalidateQueries({
        queryKey: ["analytics", "report-metrics", range],
      });
    },
    [bucket, notableActivitiesQuery.data?.cacheKey, queryClient, range]
  );

  useSocketSubscribe("analytics:update", handleAnalyticsUpdate);

  useEffect(() => {
    const data = notableActivitiesQuery.data;
    if (!socket || !data?.cacheKey) return;

    const room = getAnalyticsRoom(data.cacheKey);
    const analyticsQuery: AnalyticsSocketQuery = {
      cacheKey: data.cacheKey,
      rangePreset: data.rangePreset,
      bucketPreset: data.bucketPreset,
      bucketSizeMinutes: data.bucketSizeMinutes,
      rangeStartUtc: data.rangeStartUtc,
      rangeEndUtc: data.rangeEndUtc,
    };

    socket.emit("join", room);
    socket.emit("analytics", analyticsQuery);

    return () => {
      socket.emit("leave", room);
      socket.emit("analytics", null);
    };
  }, [notableActivitiesQuery.data, socket]);

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
      <div className='mb-5 flex flex-wrap items-center justify-center gap-3'>
        <div
          role='group'
          aria-label='Time range'
          className='inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-[0_2px_8px_rgba(15,23,42,0.08)] dark:border-gray-600 dark:bg-gray-800'
        >
          {rangeOptions.map((option) => (
            <button
              key={option.value}
              type='button'
              onClick={() => setRange(option.value)}
              aria-pressed={range === option.value}
              className={[
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                range === option.value
                  ? "bg-[#166534] text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-700",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div
          role='group'
          aria-label='Bucket size'
          className='inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-[0_2px_8px_rgba(15,23,42,0.08)] dark:border-gray-600 dark:bg-gray-800'
        >
          {selectedRange.buckets.map((bucketOption) => (
            <button
              key={bucketOption}
              type='button'
              onClick={() => setBucket(bucketOption)}
              aria-pressed={bucket === bucketOption}
              className={[
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
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
