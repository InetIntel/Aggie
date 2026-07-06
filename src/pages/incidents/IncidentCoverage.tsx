// Direct/Indirect Population Coverage (DPC / IPC) formatting, shared by the
// incident list item and the incidents table so the percent + border-color
// thresholds never drift between the two views.

export const coveragePercent = (value?: number | null): string =>
  typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "0.00%";

export const coverageBorderClass = (value?: number | null): string => {
  if (typeof value !== "number") return "border-black dark:border-gray-200";
  if (value < 0.1) return "border-yellow-400 dark:border-yellow-300";
  if (value <= 0.25) return "border-orange-400 dark:border-orange-300";
  return "border-red-500 dark:border-red-400";
};

// The bordered percentage pill used for both DPC and IPC.
export const CoverageBadge = ({ value }: { value?: number | null }) => (
  <span
    className={`inline-block border px-1.5 py-1 rounded leading-none ${coverageBorderClass(
      value
    )}`}
  >
    {coveragePercent(value)}
  </span>
);
