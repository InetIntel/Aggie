import { useEffect, useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserPlus, faRightToBracket, faLayerGroup, faLink, faMagnifyingGlass, faBan, faRotateRight, faDownload } from '@fortawesome/free-solid-svg-icons';

type Day = { date: string; coverage: string } & Record<string, string | number | null>;
type KpiReport = {
  columns: { key: string; label: string }[];
  days: Day[];
  totals: Record<string, number | null>;
  trackingStartedAt: string | null;
  writeWarning: boolean;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const display = (value: string | number | null) => value === null ? '—' : typeof value === 'number' ? value.toLocaleString() : value;
const sectionCardClass = 'rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-gray-700 dark:bg-gray-800';
const dateControlClass = 'inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm shadow-[0_2px_8px_rgba(15,23,42,0.08)] dark:border-gray-600 dark:bg-gray-800';
const dateInputClass = 'min-w-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-700 [color-scheme:light] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:[color-scheme:dark]';
const metricGroups = [
  { label: 'Accounts and incidents', metrics: [
    { key: 'signup', label: 'New accounts', icon: faUserPlus },
    { key: 'login', label: 'Successful logins', icon: faRightToBracket },
    { key: 'incident_created', label: 'Incidents created', icon: faLayerGroup },
  ] },
  { label: 'Alerts', metrics: [
    { key: 'alerts_assigned', label: 'Assigned', icon: faLink },
    { key: 'alerts_investigate', label: 'Investigate', icon: faMagnifyingGlass },
    { key: 'alerts_ignore', label: 'Ignore', icon: faBan },
  ] },
  { label: 'Social Media', metrics: [
    { key: 'social_assigned', label: 'Assigned', icon: faLink },
    { key: 'social_investigate', label: 'Investigate', icon: faMagnifyingGlass },
    { key: 'social_ignore', label: 'Ignore', icon: faBan },
  ] },
];

export default function Kpis() {
  const [end, setEnd] = useState(() => isoDate(new Date()));
  const [start, setStart] = useState(() => isoDate(new Date(Date.now() - 29 * 86400000)));
  useEffect(() => { document.title = 'KPI tracking - Aggie'; }, []);
  const valid = !!start && !!end && start <= end && end <= isoDate(new Date()) &&
    (Date.parse(end) - Date.parse(start)) / 86400000 < 366;
  const { data, isFetching, isError, refetch } = useQuery<KpiReport>(
    ['kpis', start, end],
    async () => (await axios.get('/api/analytics/kpis', { params: { start, end } })).data,
    { enabled: valid, retry: false }
  );
  const daysNewestFirst = [...(data?.days || [])].sort((a, b) => b.date.localeCompare(a.date));

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['Date (UTC)', 'Coverage', 'Tracking started (UTC)', ...data.columns.map((column) => column.label)],
      ...daysNewestFirst.map((day) => [day.date, day.coverage, data.trackingStartedAt || '', ...data.columns.map(({ key }) => day[key] ?? '')]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aggie-kpis-${start}-${end}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="py-6 space-y-5 text-slate-900 dark:text-white">
    <h1 className="text-2xl font-semibold">KPI tracking</h1>
    <div className="flex flex-wrap items-center gap-3">
      <label className={dateControlClass}><span className="font-medium text-slate-700 dark:text-gray-200">Start date (UTC)</span><input className={dateInputClass} type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label>
      <label className={dateControlClass}><span className="font-medium text-slate-700 dark:text-gray-200">End date (UTC)</span><input className={dateInputClass} type="date" value={end} min={start} max={isoDate(new Date())} onChange={(event) => setEnd(event.target.value)} /></label>
      <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" disabled={!valid || isFetching} onClick={() => refetch()}><FontAwesomeIcon icon={faRotateRight} aria-hidden />Refresh</button>
      <button className="inline-flex items-center gap-2 rounded-full bg-[#166534] px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!valid || !data || isFetching || isError} onClick={exportCsv}><FontAwesomeIcon icon={faDownload} aria-hidden />Export CSV</button>
    </div>
    {!valid && <p role="alert">Choose a valid date range of up to 366 days ending today or earlier.</p>}
    {isFetching && <p role="status">Loading KPI report…</p>}
    {isError && <p role="alert">Unable to load KPI report. Try refreshing.</p>}
    {valid && data && !isError && <>
      {data.writeWarning && <p role="alert" className="text-amber-800 dark:text-amber-300">Some activity could not be recorded. These totals may be incomplete; check server logs before using them in a funder report.</p>}
      <section className={sectionCardClass} aria-labelledby="kpi-metrics-heading">
        <h2 id="kpi-metrics-heading" className="text-xl font-semibold">Metrics</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {metricGroups.map((group) => <div key={group.label} className="min-w-0 space-y-3">
            <h3 className="border-b border-[#CDEAF4] pb-2 text-lg font-bold text-[#166534] dark:border-gray-700 dark:text-lime-300">{group.label}</h3>
            <dl className="flex flex-col gap-2">
              {group.metrics.map(({ key, label, icon }) => <div key={key} className="flex items-center gap-2 rounded-[10px] bg-white p-2 shadow-[0_4px_10px_rgba(0,0,0,0.25)] dark:bg-gray-700">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#51B6D8] text-white"><FontAwesomeIcon icon={icon} className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0"><dt className="text-xs text-black dark:text-gray-200">{label}</dt><dd className="text-[15px] font-bold tabular-nums text-black dark:text-white">{display(data.totals[key])}</dd></div>
              </div>)}
            </dl>
          </div>)}
        </div>
      </section>
      <section className={sectionCardClass} aria-labelledby="kpi-daily-heading">
        <h2 id="kpi-daily-heading" className="text-xl font-semibold">Daily activity (UTC)</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-gray-700">
          <table className="w-full text-sm text-right tabular-nums" aria-labelledby="kpi-daily-heading">
            <thead className="bg-slate-50 text-slate-700 dark:bg-gray-700 dark:text-gray-200"><tr><th scope="col" className="sticky left-0 z-10 bg-slate-50 dark:bg-gray-700 p-3 text-left">Date</th><th scope="col" className="p-3">Coverage</th>{data.columns.map(({ key, label }) => <th scope="col" className="p-3 min-w-[110px]" key={key}>{label}</th>)}</tr></thead>
            <tbody>{daysNewestFirst.map((day) => <tr key={day.date} className="border-t border-slate-200 text-slate-700 dark:border-gray-700 dark:text-gray-200"><th scope="row" className="sticky left-0 z-10 bg-white dark:bg-gray-800 p-3 whitespace-nowrap text-left font-normal">{day.date}</th><td className="p-3">{day.coverage}</td>{data.columns.map(({ key }) => <td className="p-3" key={key}>{display(day[key])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}
  </section>;
}
