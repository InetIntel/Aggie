import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { Report } from "../../api/reports/types";
import { useOoniChart } from "./useOoniChart";

interface IProps {
  report: Report;
  /** Domains that had no measurements at alert time; selected by default. */
  alertDomains?: string[];
}

const HOUR_MS = 60 * 60 * 1000;

// Dates and times are UTC, since OONI's buckets are.
const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" });
const fmtTime = (d: Date) =>
  `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
// "Sep 14" for blocks that start at midnight, "Sep 14 14:00" otherwise.
const fmtStart = (d: Date) =>
  d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? fmtDate(d) : `${fmtDate(d)} ${fmtTime(d)}`;
const fmtStamp = (d: Date) => `${fmtDate(d)} ${fmtTime(d)}`;

const muted = "text-sm text-slate-500 dark:text-gray-400";
const linkButton =
  "text-xs underline text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white";

const OoniChart = ({ report, alertDomains = [] }: IProps) => {
  const { chart: data, loading } = useOoniChart(report);
  // null = user hasn't touched the picker, so follow the default.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);

  const allDomains = useMemo(() => Object.keys(data?.domains ?? {}).sort(), [data]);
  const defaultSelection = useMemo(() => {
    const inAlert = alertDomains.filter((d) => allDomains.includes(d));
    return inAlert.length > 0 ? inAlert : allDomains;
  }, [alertDomains, allDomains]);
  const selected = picked ?? defaultSelection;

  // Blocks are 24-hour stretches counted back from where the alert's window ends,
  // so the last one is the alert's own window. Charts stored in the earlier
  // calendar-day shape (a "days" list) are drawn as midnight-to-midnight blocks.
  const blockMs = (data?.blockHours ?? 24) * HOUR_MS;
  const starts = useMemo(
    () =>
      data?.starts ?? data?.days?.map((day) => `${day}T00:00:00.000Z`) ?? [],
    [data]
  );

  const points = useMemo(() => {
    if (!data) return [];
    return starts.map((iso, i) => {
      const start = new Date(iso);
      const end = new Date(start.getTime() + blockMs);
      return {
        label: fmtStart(start),
        range: `${fmtStamp(start)} to ${fmtStamp(end)} UTC`,
        count: selected.reduce((sum, d) => sum + (data.domains[d]?.[i] ?? 0), 0),
      };
    });
  }, [data, starts, blockMs, selected]);

  if (loading) return <p className={muted}>Loading last 14 days…</p>;
  if (!data) return <p className={muted}>The last 14 days were not stored for this alert.</p>;

  const toggle = (domain: string) =>
    setPicked(
      selected.includes(domain) ? selected.filter((d) => d !== domain) : [...selected, domain]
    );

  return (
    <div className='text-slate-500 dark:text-gray-400'>
      <div className='mb-1 flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm'>
          Measurements per 24 hours, last {starts.length} blocks ·{" "}
          {selected.length === allDomains.length
            ? `all ${allDomains.length} watched domains`
            : `${selected.length} of ${allDomains.length} domains`}
        </p>
        <button type='button' className={linkButton} onClick={() => setOpen(!open)}>
          {open ? "Hide domains" : "Choose domains"}
        </button>
      </div>
      {open && (
        <div className='mb-2 rounded border border-slate-200 p-2 dark:border-gray-700'>
          <div className='mb-1 flex gap-3'>
            <button type='button' className={linkButton} onClick={() => setPicked(allDomains)}>
              All
            </button>
            <button type='button' className={linkButton} onClick={() => setPicked([])}>
              None
            </button>
            {alertDomains.length > 0 && (
              <button
                type='button'
                className={linkButton}
                onClick={() => setPicked(defaultSelection)}
              >
                Alert domains
              </button>
            )}
          </div>
          <ul className='max-h-40 overflow-y-auto text-sm'>
            {allDomains.map((domain) => (
              <li key={domain}>
                <label className='flex cursor-pointer items-center gap-2 py-0.5'>
                  <input
                    type='checkbox'
                    checked={selected.includes(domain)}
                    onChange={() => toggle(domain)}
                  />
                  <span className='break-all'>{domain}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ height: 160 }}>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke='currentColor' strokeOpacity={0.15} vertical={false} />
            <XAxis
              dataKey='label'
              tick={{ fill: "currentColor", fontSize: 11 }}
              stroke='currentColor'
              strokeOpacity={0.3}
              minTickGap={28}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "currentColor", fontSize: 11 }}
              stroke='currentColor'
              strokeOpacity={0.3}
              width={44}
            />
            <Tooltip
              labelFormatter={(_, payload) => payload?.[0]?.payload?.range ?? ""}
              formatter={(value: number) => [value, "Measurements"]}
            />
            <Bar dataKey='count' fill='#0ea5e9' radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className='mt-1 text-xs'>
        Each bar is 24 hours (UTC). The last bar is this alert's window, ending{" "}
        {fmtStamp(new Date(data.until))}.
      </p>
    </div>
  );
};

export default OoniChart;
