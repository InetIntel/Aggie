import { Link } from "react-router-dom";
import { ReactComponent as OpenEye } from "../../../components/icons/OpenEye.svg";
import { ReactComponent as ClosedEye } from "../../../components/icons/ClosedEye.svg";
import { ReactComponent as LinkIcon } from "../../../components/icons/Link.svg";
import { ReactComponent as Unlink } from "../../../components/icons/Unlink.svg";
import { ReactComponent as InvestigateAndLink } from "../../../components/icons/InvestigateAndLink.svg";
import { ReactComponent as InvestigateAndUnlink } from "../../../components/icons/InvestigateAndUnlink.svg";
import type {
  ReportMetricCategory,
  ReportMetricsResponse,
} from "../../../api/analytics/types";

interface MetricsListProps {
  data?: ReportMetricsResponse;
  isLoading?: boolean;
}

// Short display labels keyed by the backend `metric.key`. The API returns longer
// labels ("Linked to incident", "Investigate — linked"); the chips show the
// condensed design copy while the deep-link `query` stays untouched.
const SHORT_LABELS: Record<string, string> = {
  read: "Read",
  unread: "Unread",
  linked: "Linked",
  unlinked: "Unlinked",
  "investigate-linked": "Investigate and Linked",
  "investigate-unlinked": "Investigate and Unlinked",
};

// SVGR ReactComponents; each SVG is hard-coded white so it renders on the teal badge.
const METRIC_ICONS: Record<
  string,
  React.FC<React.SVGProps<SVGSVGElement>>
> = {
  read: OpenEye,
  unread: ClosedEye,
  linked: LinkIcon,
  unlinked: Unlink,
  "investigate-linked": InvestigateAndLink,
  "investigate-unlinked": InvestigateAndUnlink,
};

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
        <div key={category.key} className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1'>
            <h3 className='text-lg font-bold text-[#166534] dark:text-lime-300'>
              {category.label}
            </h3>
            <div className='border-b border-[#CDEAF4] dark:border-gray-700' />
          </div>
          <div className='flex flex-wrap content-start justify-start gap-2'>
            {category.metrics.map((metric) => {
              const Icon = METRIC_ICONS[metric.key];
              return (
                <Link
                  key={metric.key}
                  to={hrefForMetric(category, metric.query)}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-center gap-2 rounded-[10px] bg-white p-[5px] shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition hover:brightness-95 dark:bg-gray-700'
                >
                  <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#51B6D8]'>
                    {Icon && <Icon className='h-4 w-4' aria-hidden />}
                  </span>
                  <span className='flex flex-col'>
                    <span className='text-xs font-extralight text-black dark:text-gray-200'>
                      {SHORT_LABELS[metric.key] ?? metric.label}
                    </span>
                    <span className='text-[15px] font-bold text-black dark:text-white'>
                      {metric.count}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MetricsList;
