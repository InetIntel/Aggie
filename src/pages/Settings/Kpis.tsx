import { useEffect, useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

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

  return <section className="py-4 space-y-4">
    <h1 className="text-2xl font-semibold">KPI tracking</h1>
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">Start date (UTC)<input className="border rounded p-2" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label>
      <label className="flex flex-col gap-1">End date (UTC)<input className="border rounded p-2" type="date" value={end} min={start} max={isoDate(new Date())} onChange={(event) => setEnd(event.target.value)} /></label>
      <button className="border rounded px-3 py-2 disabled:opacity-50" disabled={!valid || isFetching} onClick={() => refetch()}>Refresh</button>
      <button className="bg-lime-200 rounded px-3 py-2 disabled:opacity-50" disabled={!valid || !data || isFetching || isError} onClick={exportCsv}>Export CSV</button>
    </div>
    {!valid && <p role="alert">Choose a valid date range of up to 366 days ending today or earlier.</p>}
    {isFetching && <p role="status">Loading KPI report…</p>}
    {isError && <p role="alert">Unable to load KPI report. Try refreshing.</p>}
    {valid && data && !isError && <>
      {data.writeWarning && <p role="alert" className="text-amber-800">Some activity could not be recorded. These totals may be incomplete; check server logs before using them in a funder report.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {data.columns.filter(({ key }) => key !== 'dailyUsers').map(({ key, label }) => <div key={key} className="border rounded-lg p-3 bg-white">
          <div className="text-sm text-slate-600">{label}</div>
          <div className="text-2xl font-semibold">{display(data.totals[key])}</div>
        </div>)}
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm text-right">
          <caption className="text-left p-3 font-medium">Daily activity (UTC)</caption>
          <thead className="bg-slate-100"><tr><th scope="col" className="sticky left-0 z-10 bg-slate-100 p-3 text-left">Date</th><th scope="col" className="p-3">Coverage</th>{data.columns.map(({ key, label }) => <th scope="col" className="p-3 min-w-[110px]" key={key}>{label}</th>)}</tr></thead>
          <tbody>{daysNewestFirst.map((day) => <tr key={day.date} className="border-t"><th scope="row" className="sticky left-0 z-10 bg-white p-3 whitespace-nowrap text-left font-normal">{day.date}</th><td className="p-3">{day.coverage}</td>{data.columns.map(({ key }) => <td className="p-3" key={key}>{display(day[key])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
