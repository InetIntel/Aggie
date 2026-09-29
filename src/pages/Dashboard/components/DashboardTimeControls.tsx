import type { AnalyticsRangePreset } from "../../../api/analytics/types";
import { MAX_CUSTOM_RANGE_DAYS } from "../../../api/analytics/types";
import DateRangeSelector from "./DateRangeSelector";

const pillGroupClass =
  "inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-[0_2px_8px_rgba(15,23,42,0.08)] dark:border-gray-600 dark:bg-gray-800";

function pillClass(isActive: boolean, activeClass: string) {
  return [
    "rounded-full px-4 py-1.5 text-sm font-medium transition",
    isActive
      ? activeClass
      : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-700",
  ].join(" ");
}

export const dashboardRangeOptions: {
  label: string;
  value: AnalyticsRangePreset;
}[] = [
  { label: "Last 24h", value: "last24h" },
  { label: "Last 7d", value: "last7d" },
  { label: "Custom", value: "custom" },
];

interface IProps {
  range: AnalyticsRangePreset;
  onRangeChange: (range: AnalyticsRangePreset) => void;
  customFromDay: string;
  customToDay: string;
  onCustomRangeChange: (fromDay: string, toDay: string) => void;
  // e.g. "UTC" or "EDT": the zone the grid and every timestamp on the page are in.
  timeZoneLabel: string;
}

const DashboardTimeControls = ({
  range,
  onRangeChange,
  customFromDay,
  customToDay,
  onCustomRangeChange,
  timeZoneLabel,
}: IProps) => {
  return (
    <div className='mb-5 flex flex-wrap items-center justify-center gap-3'>
      <div role='group' aria-label='Time range' className={pillGroupClass}>
        {dashboardRangeOptions.map((option) => (
          <button
            key={option.value}
            type='button'
            onClick={() => onRangeChange(option.value)}
            aria-pressed={range === option.value}
            className={pillClass(range === option.value, "bg-[#166534] text-white")}
          >
            {option.label}
          </button>
        ))}
      </div>

      {range === "custom" && (
        <DateRangeSelector
          fromDay={customFromDay}
          toDay={customToDay}
          onChange={onCustomRangeChange}
          maxSpanDays={MAX_CUSTOM_RANGE_DAYS}
        />
      )}

      {timeZoneLabel && (
        <span
          className='text-xs text-slate-500 dark:text-gray-400'
          title='Set in your profile under display preferences'
        >
          Times in {timeZoneLabel}
        </span>
      )}
    </div>
  );
};

export default DashboardTimeControls;
