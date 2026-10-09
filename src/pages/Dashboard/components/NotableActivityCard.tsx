import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faFolderPlus,
  faLink,
  faPlus,
  faSpinner,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { NotableActivity } from "../../../api/analytics/types";
import { ALERT_MEDIA_OPTIONS, DATA_SOURCE_OPTIONS } from "../../../api/common";
import { useDashboardFormatters } from "../dashboardHelpers";
import NotableActivityTitle from "./NotableActivityTitle";

const sourceLabels: Record<string, string> = {
  ioda: "IODA",
  cloudflare: "Cloudflare",
  ooni: "OONI",
};
// Every notable activity card action is a full-width row of the same height.
const cardActionClass =
  "flex h-9 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-xs font-medium uppercase shadow-sm transition";

function NotableActivityCard({
  activity,
  cacheKey,
  onDismiss,
  onCreateIncident,
  onAddToIncident,
  isCreatingIncident,
}: {
  activity: NotableActivity;
  cacheKey: string;
  onDismiss: () => void;
  onCreateIncident: () => void;
  onAddToIncident: () => void;
  isCreatingIncident: boolean;
}) {
  const { formatActivityWindow } = useDashboardFormatters();
  const isStartTimeGrouped = activity.aggregationMethod === "startTime";

  // `locations` is absent on snapshots cached before it existed, hence the fallback.
  const titles =
    activity.locations && activity.locations.length > 0
      ? activity.locations
      : [[activity.asn, activity.geoScope].filter(Boolean).join(" / ")];

  return (
    <article className='rounded-lg border border-slate-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-gray-700 dark:bg-gray-800'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-1.5 whitespace-nowrap'>
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              activity.isHighConfidence
                ? "border border-red-300 bg-red-100 text-red-700"
                : "border border-amber-300 bg-amber-100 text-amber-700",
            ].join(" ")}
          >
            {activity.isHighConfidence ? "High" : "Medium"}
          </span>
          <Link
            to={`/alerts?reportIds=${activity.reportIds.join(",")}&alerts=true`}
            target='_blank'
            rel='noopener noreferrer'
            title='View reports'
            className='inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 transition hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className='text-[9px]' />
            {activity.totalReports} report{activity.totalReports === 1 ? "" : "s"}
          </Link>
        </div>
        <button
          type='button'
          onClick={onDismiss}
          className='grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-base text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.16)] transition hover:bg-slate-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          aria-label='Dismiss activity card'
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className='mt-3'>
        {/* Under start-time grouping the window is the first and last outage start in the
            cluster, not a grid cell — say so, or the timestamp reads like a bucket. */}
        {isStartTimeGrouped && (
          <p className='text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400'>
            {activity.bucketStart === activity.bucketEnd
              ? "Outage start"
              : "Outage starts"}
          </p>
        )}
        <p className='text-sm font-semibold leading-tight text-slate-950 dark:text-white'>
          {formatActivityWindow(activity.bucketStart, activity.bucketEnd)}
        </p>
      </div>
      <NotableActivityTitle
        className='mt-2'
        titles={titles}
        fallback='Location details unavailable'
      />

      <div className='my-3 h-px bg-slate-200 dark:bg-gray-700' />

      <div className='space-y-2.5'>
        <NotableActivityIndicatorRow
          title='Platforms'
          values={activity.sources}
          options={[...ALERT_MEDIA_OPTIONS]}
          renderLabel={(source) => sourceLabels[source] || source}
        />
        <NotableActivityIndicatorRow
          title='Sources'
          values={activity.signals}
          options={[...DATA_SOURCE_OPTIONS]}
        />
      </div>

      {/* <div className='my-3 h-px bg-slate-200 dark:bg-gray-700' />

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

      <div className='my-3 h-px bg-slate-200 dark:bg-gray-700' />
{/* 
      <div className='flex items-center gap-3 text-sm text-slate-700 dark:text-gray-300'>
        <FontAwesomeIcon icon={faCircleExclamation} />
        <span>{locationSummary || "Location details unavailable"}</span>
      </div> */}

      <div className='flex flex-col gap-2'>
        {activity.incidentId ? (
          <Link
            to={`/incidents/${activity.incidentId}`}
            className={`${cardActionClass} bg-[#1683A3] text-white hover:bg-[#126b85]`}
          >
            <FontAwesomeIcon icon={faLink} />
            <span>Open Linked Incident</span>
          </Link>
        ) : (
          <>
            <button
              type='button'
              onClick={onCreateIncident}
              disabled={!cacheKey || isCreatingIncident}
              className={`${cardActionClass} bg-[#166534] text-white hover:bg-[#14532d] disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <FontAwesomeIcon
                icon={isCreatingIncident ? faSpinner : faPlus}
                className={isCreatingIncident ? "animate-spin" : ""}
              />
              <span>{isCreatingIncident ? "Creating" : "New Incident"}</span>
            </button>
            <button
              type='button'
              onClick={onAddToIncident}
              disabled={!cacheKey || isCreatingIncident}
              className={`${cardActionClass} border border-[#166534] text-[#166534] hover:bg-[#166534]/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-lime-500 dark:text-lime-300 dark:hover:bg-lime-500/10`}
            >
              <FontAwesomeIcon icon={faFolderPlus} />
              <span>Add to Incident</span>
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function NotableActivityIndicatorRow({
  title,
  values,
  options,
  renderLabel = (value) => value,
  renderIcon,
}: {
  title: string;
  values?: string[];
  options: string[];
  renderLabel?: (value: string) => string;
  renderIcon?: (value: string) => ReactNode;
}) {
  const activeValues = new Set((values || []).map(normalizeActivityIndicatorValue));
  const extraValues = (values || []).filter(
    (value) =>
      !options.some(
        (option) =>
          normalizeActivityIndicatorValue(option) ===
          normalizeActivityIndicatorValue(value)
      )
  );
  const displayOptions = [...options, ...extraValues];

  return (
    <div>
      <p className='text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400'>
        {title}
      </p>
      <div className='mt-1.5 flex flex-wrap gap-1.5'>
        {displayOptions.map((option) => {
          const isActive = activeValues.has(normalizeActivityIndicatorValue(option));

          return (
            <span
              key={option}
              aria-label={`${renderLabel(option)} ${isActive ? "active" : "inactive"}`}
              className={[
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
                isActive
                  ? "border-lime-400 bg-lime-100 text-slate-800 shadow-[0_0_0_1px_rgba(132,204,22,0.25)] dark:border-lime-500 dark:bg-lime-900/40 dark:text-lime-100"
                  : "border-slate-200 bg-slate-50 text-slate-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500",
              ].join(" ")}
            >
              {renderIcon?.(option)}
              {renderLabel(option)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function normalizeActivityIndicatorValue(value: string) {
  return value.trim().toLowerCase();
}

export default NotableActivityCard;
