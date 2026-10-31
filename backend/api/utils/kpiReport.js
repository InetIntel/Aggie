'use strict';

const DAY = 86400000;
const columns = [
  ['signup', 'New accounts'], ['login', 'Successful logins'],
  ['dailyUsers', 'Unique daily login users'], ['incident_created', 'Incidents created'],
  ['alerts_assigned', 'Alerts assigned'], ['social_assigned', 'Social posts assigned'],
  ['alerts_investigate', 'Alerts: investigate'], ['social_investigate', 'Social posts: investigate'],
  ['alerts_ignore', 'Alerts: ignore'], ['social_ignore', 'Social posts: ignore'],
].map(([key, label]) => ({ key, label }));

function resolveRange(query, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const parse = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use YYYY-MM-DD dates.');
    const date = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date.');
    return date;
  };
  const end = parse(query.end === undefined ? today : query.end);
  const start = query.start === undefined ? new Date(end.getTime() - 29 * DAY) : parse(query.start);
  if (start > end || (end - start) / DAY >= 366) throw new Error('Choose an ordered range of at most 366 days.');
  if (end > parse(today)) throw new Error('End date cannot be in the future.');
  return { start, end: new Date(end.getTime() + DAY) };
}

function buildPipeline({ start, end }) {
  return [
    { $match: { at: { $gte: start, $lt: end }, kind: { $ne: 'tracking_started' } } },
    { $group: {
      _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: 'UTC' } },
        kind: '$kind', category: '$category', subject: '$subject' },
      actions: { $sum: 1 },
    } },
    { $group: {
      _id: { date: '$_id.date', kind: '$_id.kind', category: '$_id.category' },
      actions: { $sum: '$actions' }, uniqueSubjects: { $sum: 1 },
    } },
  ];
}

function formatReport(range, aggregates, trackingStartedAt, now = new Date()) {
  const days = [];
  for (let time = +range.start; time < +range.end; time += DAY) {
    const date = new Date(time).toISOString().slice(0, 10);
    const coverage = !trackingStartedAt || time + DAY <= +new Date(trackingStartedAt)
      ? 'unavailable' : time < +new Date(trackingStartedAt) || time + DAY > +now ? 'partial' : 'complete';
    days.push({ date, coverage, ...Object.fromEntries(columns.map(({ key }) => [key, coverage === 'unavailable' ? null : 0])) });
  }
  const byDay = new Map(days.map((day) => [day.date, day]));
  for (const row of aggregates) {
    const day = byDay.get(row._id.date);
    if (!day || day.coverage === 'unavailable') continue;
    const key = row._id.category ? `${row._id.category}_${row._id.kind}` : row._id.kind;
    if (columns.some((column) => column.key === key)) day[key] = row._id.category ? row.uniqueSubjects : row.actions;
    if (key === 'login') day.dailyUsers = row.uniqueSubjects;
  }
  const totals = Object.fromEntries(columns.map(({ key }) => [key,
    days.some((day) => day.coverage !== 'unavailable') ? days.reduce((sum, day) => sum + (day[key] || 0), 0) : null,
  ]));
  return { columns, days, totals, trackingStartedAt, timezone: 'UTC' };
}

module.exports = { resolveRange, buildPipeline, formatReport };
