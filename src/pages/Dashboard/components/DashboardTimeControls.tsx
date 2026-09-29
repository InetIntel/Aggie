import { FloatingTree } from "@floating-ui/react";
import DateSelector from "../../../components/filters/DateSelector";
import type {
  AnalyticsBucketPreset,
  AnalyticsRangePreset,
} from "../../../api/analytics/types";
import { MAX_CUSTOM_RANGE_DAYS } from "../../../api/analytics/types";
import { addPickerDays } from "../dashboardHelpers";

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
  onCustomFromDayChange: (day: string) => void;
  onCustomToDayChange: (day: string) => void;
  // e.g. "UTC" or "EDT": the zone the grid and every timestamp on the page are in.
  timeZoneLabel: string;
}

const DashboardTimeControls = ({
  range,
  onRangeChange,
  customFromDay,
  customToDay,
  onCustomFromDayChange,
  onCustomToDayChange,
  timeZoneLabel,
}: IProps) => {
  // Both days count in full, so a span of N days means the last day is N - 1 after the first.
  const maxSpanOffset = MAX_CUSTOM_RANGE_DAYS - 1;

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
        <FloatingTree>
          <div className='inline-flex items-center gap-2 text-sm text-slate-700 dark:text-gray-200'>
            <DateSelector
              unsetLabel='From'
              value={customFromDay}
              onChange={onCustomFromDayChange}
              maxDate={new Date(customToDay)}
              minDate={new Date(addPickerDays(customToDay, -maxSpanOffset))}
              referenceDate={new Date(customToDay)}
            />
            <span aria-hidden='true'>–</span>
            <DateSelector
              unsetLabel='To'
              value={customToDay}
              onChange={onCustomToDayChange}
              minDate={new Date(customFromDay)}
              maxDate={new Date(addPickerDays(customFromDay, maxSpanOffset))}
              referenceDate={new Date(customFromDay)}
            />
          </div>
        </FloatingTree>
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

// The trend chart's bucket size. Lives in the Trends card, the only thing it affects:
// the notable activity cards group by start time, independent of the grid.
export const BucketSizeToggle = ({
  bucket,
  bucketOptions,
  onBucketChange,
}: {
  bucket: AnalyticsBucketPreset;
  bucketOptions: AnalyticsBucketPreset[];
  onBucketChange: (bucket: AnalyticsBucketPreset) => void;
}) => (
  <div role='group' aria-label='Bucket size' className={pillGroupClass}>
    {bucketOptions.map((bucketOption) => (
      <button
        key={bucketOption}
        type='button'
        onClick={() => onBucketChange(bucketOption)}
        aria-pressed={bucket === bucketOption}
        className={pillClass(
          bucket === bucketOption,
          "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
        )}
      >
        {bucketOption}
      </button>
    ))}
  </div>
);

export default DashboardTimeControls;
