import { Link } from "react-router-dom";
import type {
  ReportMetric,
  ReportMetricCategory,
} from "../../../api/analytics/types";

// Rows are grouped by backend `metric.key`; the investigate rows repeat the
// linked/unlinked labels, so each group carries its own display copy.
const METRIC_GROUPS: {
  label: string;
  rows: { key: string; label: string }[];
}[] = [
  {
    label: "Overview",
    rows: [
      { key: "read", label: "Read" },
      { key: "unread", label: "Unread" },
      { key: "linked", label: "Linked to incident" },
      { key: "unlinked", label: "Unlinked to incident" },
    ],
  },
  {
    label: "Investigate",
    rows: [
      { key: "investigate-linked", label: "Linked to incident" },
      { key: "investigate-unlinked", label: "Unlinked to incident" },
    ],
  },
];

// Alerts deep-link to /alerts, social to /mediaposts; the row's `query` reproduces
// the filter the count used, so the destination list's "of N" matches it.
function hrefForMetric(category: ReportMetricCategory, metric: ReportMetric) {
  const basePath = category.key === "alerts" ? "/alerts" : "/mediaposts";
  return `${basePath}?${new URLSearchParams(metric.query).toString()}`;
}

interface IProps {
  category?: ReportMetricCategory;
  isLoading?: boolean;
}

const MetricsList = ({ category, isLoading }: IProps) => {
  if (!category) {
    return (
      <p className='py-6 text-center text-sm text-slate-500 dark:text-gray-400'>
        {isLoading ? "Loading metrics" : "Metrics unavailable"}
      </p>
    );
  }

  const metricsByKey = new Map(category.metrics.map((metric) => [metric.key, metric]));

  return (
    <div className='rounded-xl border border-slate-200 px-3 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.06)] dark:border-gray-700'>
      {METRIC_GROUPS.map((group) => (
        <div
          key={group.label}
          className='border-b border-slate-200 py-2 last:border-b-0 dark:border-gray-700'
        >
          <h4 className='mb-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400'>
            {group.label}
          </h4>
          <ul>
            {group.rows.map((row) => {
              const metric = metricsByKey.get(row.key);
              if (!metric) return null;
              return (
                <li key={row.key}>
                  <Link
                    to={hrefForMetric(category, metric)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='-mx-1 flex items-center justify-between gap-3 rounded px-1 py-0.5 text-sm transition hover:bg-slate-100 dark:hover:bg-gray-700'
                  >
                    <span className='text-slate-600 dark:text-gray-300'>
                      {row.label}
                    </span>
                    <span className='font-semibold text-slate-900 dark:text-white'>
                      {metric.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default MetricsList;
