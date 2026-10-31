'use strict';

function csvCell(value) {
  const text = String(value);
  const safe = /^[=+@\-\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function reportCsv(data, range) {
  const start = range.start.toISOString().slice(0, 10);
  const end = new Date(+range.end - 86400000).toISOString().slice(0, 10);
  const name = data.teamOptions.find((team) => team.id === data.selectedTeam)?.name || (data.globalAccess ? 'All teams' : 'My accessible teams');
  const rows = [
    ['Row type', 'Team ID', 'Team', 'Start (UTC)', 'End (UTC)', 'Date (UTC)', 'Coverage', 'Tracking started (UTC)',
      ...data.columns.map((column) => column.key === 'dailyUsers' ? 'Daily unique login users (summed for totals)' : column.label),
      ...data.columns.map((column) => column.key === 'dailyUsers' ? 'Unique users with shared logins (summed daily)' : `${column.label} shared`)],
    ...data.teams.map((team) => ['Team total', team.id, team.name, start, end, '', team.coverage, team.trackingStartedAt || '',
      ...data.columns.map(({ key }) => team.totals[key] ?? ''), ...data.columns.map(({ key }) => team.shared[key] ?? '')]),
    ...[...data.days].sort((a, b) => b.date.localeCompare(a.date)).map((day) => ['Daily total', data.selectedTeam || '', name,
      start, end, day.date, day.coverage, data.trackingStartedAt || '',
      ...data.columns.map(({ key }) => day[key] ?? ''), ...data.columns.map(() => '')]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

module.exports = { reportCsv };
