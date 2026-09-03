import { Link } from "react-router-dom";
import type {
  ReportMetricCategory,
  ReportMetricsResponse,
} from "../../../api/analytics/types";

interface MetricsListProps {
  data?: ReportMetricsResponse;
  isLoading?: boolean;
}

// Alerts deep-link to /alerts, social to /mediaposts. The route scopes `alerts`;
// the row's `query` (status/groupId/irrelevant/after/before) reproduces the exact
// filter the count used, so the destination list's "of N" matches the count.
function basePathForCategory(category: ReportMetricCategory) {
  return category.key === "alerts" ? "/alerts" : "/mediaposts";
}

function hrefForMetric(
  category: ReportMetricCategory,
  query: Record<string, string>
) {
  const params = new URLSearchParams(query);
  return `${basePathForCategory(category)}?${params.toString()}`;
}

const MetricsList = ({ data, isLoading }: MetricsListProps) => {
  if (!data) {
    return (
      <div className='flex flex-1 items-center justify-center py-6'>
        <p className='text-sm text-slate-500 dark:text-gray-400'>
          {isLoading ? "Loading metrics" : "Metrics unavailable"}
        </p>
      </div>
    );
  }

  return (
    <div className='mt-2 flex flex-1 flex-col gap-5'>
      {data.categories.map((category) => (
        <div key={category.key}>
          <h3 className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400'>
            {category.label}
          </h3>
          <div className='mt-2 divide-y divide-slate-200 dark:divide-gray-700'>
            {category.metrics.map((metric) => (
              <Link
                key={metric.key}
                to={hrefForMetric(category, metric.query)}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center justify-between gap-3 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-gray-700/40'
              >
                <span className='text-slate-700 dark:text-gray-200'>
                  {metric.label}
                </span>
                <span className='font-semibold text-[#166534] dark:text-lime-300'>
                  {metric.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MetricsList;
