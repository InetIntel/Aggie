import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { faTwitter } from "@fortawesome/free-brands-svg-icons";
import type {
  ReportMetric,
  ReportMetricCategory,
  ReportMetricsResponse,
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
    <div>
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

// The headline strip: the counts that still need someone's attention, per category.
const HEADLINE_METRICS: { key: string; label: string }[] = [
  { key: "unread", label: "Unread" },
  { key: "investigate-unlinked", label: "Investigate and unlinked" },
];

const CATEGORY_DISPLAY: Record<
  ReportMetricCategory["key"],
  { label: string; icon: IconDefinition }
> = {
  alerts: { label: "Alert", icon: faBell },
  social: { label: "Social Media Post", icon: faTwitter },
};

function CategoryIcon({
  category,
  size,
}: {
  category: ReportMetricCategory["key"];
  size: "sm" | "lg";
}) {
  return (
    <span
      className={[
        "flex shrink-0 items-center justify-center rounded-full bg-[#51B6D8] text-white",
        size === "lg" ? "h-9 w-9 text-lg" : "h-4 w-4 text-[10px]",
      ].join(" ")}
    >
      <FontAwesomeIcon icon={CATEGORY_DISPLAY[category].icon} />
    </span>
  );
}

interface HeadlineProps {
  data?: ReportMetricsResponse;
  isLoading?: boolean;
}

export const HeadlineMetrics = ({ data, isLoading }: HeadlineProps) => {
  if (!data) {
    return (
      <p className='py-4 text-sm text-slate-500 dark:text-gray-400'>
        {isLoading ? "Loading metrics" : "Metrics unavailable"}
      </p>
    );
  }

  return (
    <>
      <div className='flex flex-wrap gap-3'>
        {data.categories.flatMap((category) =>
          HEADLINE_METRICS.map((row) => {
            const metric = category.metrics.find((item) => item.key === row.key);
            if (!metric) return null;
            return (
              <Link
                key={`${category.key}-${row.key}`}
                to={hrefForMetric(category, metric)}
                target='_blank'
                rel='noopener noreferrer'
                title={`${category.label}: ${row.label}`}
                className='flex items-center gap-2 rounded-[10px] bg-white py-[5px] pl-[5px] pr-3 shadow-[0_4px_10px_rgba(0,0,0,0.2)] transition hover:brightness-95 dark:bg-gray-700'
              >
                <CategoryIcon category={category.key} size='lg' />
                <span className='flex flex-col'>
                  <span className='text-xs font-light text-slate-700 dark:text-gray-200'>
                    {row.label}
                  </span>
                  <span className='text-[15px] font-bold text-slate-900 dark:text-white'>
                    {metric.count}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>
      <div className='mt-4 flex flex-wrap gap-4 text-xs text-slate-700 dark:text-gray-300'>
        {data.categories.map((category) => (
          <span key={category.key} className='inline-flex items-center gap-1.5'>
            <CategoryIcon category={category.key} size='sm' />
            {CATEGORY_DISPLAY[category.key].label}
          </span>
        ))}
      </div>
    </>
  );
};

