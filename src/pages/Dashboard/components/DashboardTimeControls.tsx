import type { AnalyticsRangePreset } from "../../../api/analytics/types";
import { MAX_CUSTOM_RANGE_DAYS } from "../../../api/analytics/types";
import type { AnalyticsWindow } from "../dashboardHelpers";
import DateRangeSelector from "./DateRangeSelector";

export const dashboardRangeOptions: {
  label: string;
  value: AnalyticsRangePreset;
}[] = [
  { label: "Last 24h", value: "last24h" },
  { label: "Last 7d", value: "last7d" },
  { label: "Custom", value: "custom" },
];

function rangeButtonClass(isActive: boolean) {
  return [
    "rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
    isActive
      ? "bg-[#1F5F78] text-white dark:bg-sky-600"
      : "bg-[#CDEAF4] text-[#1F5F78] hover:bg-[#b5dfee] dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-900/70",
  ].join(" ");
}

interface IProps {
  // The card's own time window, from useAnalyticsWindow.
  timeWindow: AnalyticsWindow;
  className?: string;
}

// A card's range picker, shown in its top-right corner.
const DashboardTimeControls = ({ timeWindow, className = "" }: IProps) => {
  return (
    <div className={`flex flex-wrap items-center justify-end gap-1.5 ${className}`}>
      <div role='group' aria-label='Time range' className='flex gap-1'>
        {dashboardRangeOptions.map((option) => (
          <button
            key={option.value}
            type='button'
            onClick={() => timeWindow.setRange(option.value)}
            aria-pressed={timeWindow.range === option.value}
            className={rangeButtonClass(timeWindow.range === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {timeWindow.range === "custom" && (
        <DateRangeSelector
          fromDay={timeWindow.customFromDay}
          toDay={timeWindow.customToDay}
          onChange={timeWindow.setCustomRange}
          maxSpanDays={MAX_CUSTOM_RANGE_DAYS}
        />
      )}
    </div>
  );
};

export default DashboardTimeControls;
