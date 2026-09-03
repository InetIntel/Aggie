import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faFolderPlus,
  faLink,
  faPlus,
  faSpinner,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { NotableActivity } from "../../../api/analytics/types";
import { DATA_SOURCE_OPTIONS } from "../../../api/common";
import { formatActivityWindow } from "../dashboardHelpers";
import NotableActivityTitle from "./NotableActivityTitle";

const notableActivitySourceOptions = ["ioda", "cloudflare"];
const sourceLabels: Record<string, string> = {
  ioda: "IODA",
  cloudflare: "Cloudflare",
};
// Every notable activity card action shares this box so the row of incident
// buttons stays exactly as tall as the full-width actions above and below it.
const cardActionClass =
  "flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium shadow-sm transition";

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
  // One "asn / geoScope" title per impacted ASN. Today the backend returns a
  // single `asn`, so this is a one-element list; when `asn` becomes an array
  // (many impacted ASNs) this yields one title per ASN and NotableActivityTitle
  // concatenates them into the reserved two lines with a "+N more" popover.
  const asns = Array.isArray(activity.asn)
    ? activity.asn
    : activity.asn
    ? [activity.asn]
    : [];
  const titles = (asns.length > 0 ? asns : [undefined]).map((asn) =>
    [asn, activity.geoScope].filter(Boolean).join(" / ")
  );

  return (
    <article className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
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
          <span className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'>
            {activity.totalReports} report{activity.totalReports === 1 ? "" : "s"}
          </span>
        </div>
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
      <NotableActivityTitle
        className='mt-3'
        titles={titles}
        fallback='Location details unavailable'
      />

      <div className='my-5 h-px bg-slate-200 dark:bg-gray-700' />

      <div className='space-y-4'>
        <NotableActivityIndicatorRow
          title='Signals'
          values={activity.signals}
          options={[...DATA_SOURCE_OPTIONS]}
        />
        <NotableActivityIndicatorRow
          title='Sources'
          values={activity.sources}
          options={notableActivitySourceOptions}
          renderLabel={(source) => sourceLabels[source] || source}
        />
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
            className={`${cardActionClass} w-full bg-[#1683A3] text-white hover:bg-[#126b85]`}
          >
            <FontAwesomeIcon icon={faLink} />
            <span>Open Linked Incident</span>
          </Link>
        ) : (
          <div className='flex items-stretch gap-3'>
            <button
              type='button'
              onClick={onCreateIncident}
              disabled={!cacheKey || isCreatingIncident}
              className={`${cardActionClass} min-w-0 flex-1 bg-[#166534] text-white hover:bg-[#14532d] disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <FontAwesomeIcon
                icon={isCreatingIncident ? faSpinner : faPlus}
                className={isCreatingIncident ? "animate-spin" : undefined}
              />
              <span className='truncate'>
                {isCreatingIncident ? "Creating" : "New Incident"}
              </span>
            </button>
            <button
              type='button'
              onClick={onAddToIncident}
              disabled={!cacheKey || isCreatingIncident}
              className={`${cardActionClass} min-w-0 flex-1 border border-[#166534] text-[#166534] hover:bg-[#166534]/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-lime-500 dark:text-lime-300 dark:hover:bg-lime-500/10`}
            >
              <FontAwesomeIcon icon={faFolderPlus} />
              <span className='truncate'>Add to Incident</span>
            </button>
          </div>
        )}
        <Link
          to={`/alerts?reportIds=${activity.reportIds.join(",")}&alerts=true`}
          target='_blank'
          rel='noopener noreferrer'
          className={`${cardActionClass} w-full bg-slate-700 text-white hover:bg-slate-800`}
        >
          <FontAwesomeIcon icon={faBell} />
          <span>View Reports</span>
        </Link>
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
      <p className='text-lg font-medium text-slate-900 dark:text-white'>{title}</p>
      <div className='mt-3 flex flex-wrap gap-2'>
        {displayOptions.map((option) => {
          const isActive = activeValues.has(normalizeActivityIndicatorValue(option));

          return (
            <span
              key={option}
              aria-label={`${renderLabel(option)} ${isActive ? "active" : "inactive"}`}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition",
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
