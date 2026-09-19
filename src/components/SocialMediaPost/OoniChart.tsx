import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { getOoniSeries } from "../../api/ooni";

interface IProps {
  asn: number;
  /** Alert day, YYYY-MM-DD. The chart shows the 14 days ending here. */
  until: string;
  /** Domains that had no measurements at alert time; selected by default. */
  alertDomains?: string[];
}

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

const muted = "text-sm text-slate-500 dark:text-gray-400";
const linkButton =
  "text-xs underline text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white";

const OoniChart = ({ asn, until, alertDomains = [] }: IProps) => {
  const { data, isLoading, isError } = useQuery(
    ["ooni-series", asn, until],
    () => getOoniSeries(asn, until),
    { staleTime: 60 * 60 * 1000, retry: 1 }
  );
  // null = user hasn't touched the picker, so follow the default.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);

  const allDomains = useMemo(() => Object.keys(data?.domains ?? {}).sort(), [data]);
  const defaultSelection = useMemo(() => {
    const inAlert = alertDomains.filter((d) => allDomains.includes(d));
    return inAlert.length > 0 ? inAlert : allDomains;
  }, [alertDomains, allDomains]);
  const selected = picked ?? defaultSelection;

  const points = useMemo(() => {
    if (!data) return [];
    return data.days.map((day, i) => ({
      day,
      count: selected.reduce((sum, d) => sum + (data.domains[d]?.[i] ?? 0), 0),
    }));
  }, [data, selected]);

  if (isLoading) return <p className={muted}>Loading last 14 days…</p>;
  if (isError || !data) return <p className={muted}>Last 14 days unavailable right now.</p>;

  const toggle = (domain: string) =>
    setPicked(
      selected.includes(domain) ? selected.filter((d) => d !== domain) : [...selected, domain]
    );

  return (
    <div className='text-slate-500 dark:text-gray-400'>
      <div className='mb-1 flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm'>
          Measurements per day, last 14 days ·{" "}
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
              dataKey='day'
              tickFormatter={shortDay}
              tick={{ fill: "currentColor", fontSize: 11 }}
              stroke='currentColor'
              strokeOpacity={0.3}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "currentColor", fontSize: 11 }}
              stroke='currentColor'
              strokeOpacity={0.3}
              width={44}
            />
            <Tooltip
              labelFormatter={(day) => shortDay(String(day))}
              formatter={(value: number) => [value, "Measurements"]}
            />
            <Bar dataKey='count' fill='#0ea5e9' radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OoniChart;
