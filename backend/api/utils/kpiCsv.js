'use strict';

function csvCell(value) {
  const text = String(value);
  const safe = /^[=+@\-\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function reportCsv(data, range) {
  const start = range.start.toISOString().slice(0, 10);
  const end = new Date(+range.end - 86400000).toISOString().slice(0, 10);
  const selectedIds = data.selectedTeams || [];
  const name = selectedIds.length ? data.teamOptions.filter((team) => selectedIds.includes(team.id)).map((team) => team.name).join('; ')
    : data.globalAccess ? 'All teams' : 'My accessible teams';
  const rows = [
    ['Row type', 'Team ID', 'Team', 'Start (UTC)', 'End (UTC)', 'Date (UTC)', 'Coverage', 'Tracking started (UTC)',
      ...data.columns.map((column) => column.key === 'dailyUsers' ? 'Daily unique login users (summed for totals)' : column.label),
      ...data.columns.map((column) => column.key === 'dailyUsers' ? 'Unique users with shared logins (summed daily)' : `${column.label} shared`)],
    ...data.teams.map((team) => ['Team total', team.id, team.name, start, end, '', team.coverage, team.trackingStartedAt || '',
      ...data.columns.map(({ key }) => team.totals[key] ?? ''), ...data.columns.map(({ key }) => team.shared[key] ?? '')]),
    ...[...data.days].sort((a, b) => b.date.localeCompare(a.date)).map((day) => ['Daily total', selectedIds.join('; '), name,
      start, end, day.date, day.coverage, data.trackingStartedAt || '',
      ...data.columns.map(({ key }) => day[key] ?? ''), ...data.columns.map(() => '')]),
  ];
  if (data.inventory) {
    const width = rows[0].length;
    rows[0].push('Metric', 'Value', 'Counted at (UTC)', 'Source ID', 'Source / feed', 'Media', 'Alerts received', 'Social posts received', 'Scope');
    rows.slice(1).forEach((row) => row.push(...Array(9).fill('')));
    const inventory = data.inventory;
    const addRow = (type, values, dated = false) => {
      const row = Array(width).fill('');
      row.splice(0, 5, type, selectedIds.join('; '), name, dated ? start : '', dated ? end : '');
      rows.push([...row, ...values]);
    };
    if (inventory.available) {
      const scope = inventory.global ? 'Platform' : 'Selected teams; incidents and sources include public content';
      const metrics = [
        ['Users', inventory.users], ['Incidents', inventory.incidents],
        ['Sources / feeds', inventory.sources], ['Enabled sources / feeds', inventory.enabledSources],
        ['Public sources', inventory.policies.public], ['Team-restricted sources', inventory.policies.restricted],
        ['Country-restricted sources', inventory.policies.country_restricted], ['Date-limited sources', inventory.policies.public_until],
      ];
      metrics.forEach(([label, value]) => addRow('Current total', [label, value, inventory.asOf, '', '', '', '', '', scope]));
      inventory.bySource.forEach((source) => addRow('Reports by source', ['', '', inventory.asOf, source.id, source.name, source.media, source.alerts, source.social, scope], true));
    } else {
      addRow('Current totals unavailable', ['', '', '', '', '', '', '', '', 'Choose named teams or all teams']);
    }
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

module.exports = { reportCsv };
