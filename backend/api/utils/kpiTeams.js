'use strict';

const { buildPipeline, formatReport } = require('./kpiReport');
const UNKNOWN = 'unknown';
const UNASSIGNED = 'unassigned';

function buildTeamPipeline(range, teamIds) {
  return [
    buildPipeline(range, teamIds)[0],
    ...(teamIds ? [{ $addFields: { teamIds: { $setIntersection: ['$teamIds', teamIds] } } }] : []),
    { $group: {
      _id: {
        date: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: 'UTC' } },
        kind: '$kind', category: '$category',
        // Report actions count once per report/day. Every login still counts.
        unit: { $cond: [{ $in: ['$kind', ['assigned', 'investigate', 'ignore']] }, '$subject', '$_id'] },
      },
      subject: { $first: '$subject' },
      memberships: { $addToSet: { $cond: [
        { $eq: [{ $type: '$teamIds' }, 'array'] },
        { $cond: [{ $gt: [{ $size: { $ifNull: ['$teamIds', []] } }, 0] }, '$teamIds', [UNASSIGNED]] },
        [UNKNOWN],
      ] } },
    } },
    { $addFields: { teams: { $reduce: {
      input: '$memberships', initialValue: [], in: { $setUnion: ['$$value', '$$this'] },
    } } } },
    { $addFields: { shared: { $gt: [{ $size: { $setDifference: ['$teams', [UNKNOWN, UNASSIGNED]] } }, 1] } } },
    { $unwind: '$teams' },
    { $group: {
      _id: { date: '$_id.date', kind: '$_id.kind', category: '$_id.category', team: '$teams' },
      actions: { $sum: 1 }, shared: { $sum: { $cond: ['$shared', 1, 0] } },
      subjects: { $addToSet: '$subject' },
      sharedSubjects: { $addToSet: { $cond: ['$shared', '$subject', null] } },
    } },
    { $project: {
      actions: 1, shared: 1,
      uniqueSubjects: { $cond: [{ $eq: ['$_id.kind', 'login'] }, { $size: '$subjects' }, '$actions'] },
      sharedSubjects: { $size: { $setDifference: ['$sharedSubjects', [null]] } },
    } },
  ];
}

function formatTeams(range, aggregates, teams, trackingStartedAt, teamTrackingStartedAt, now = new Date()) {
  const options = new Map(teams.map((team) => [String(team._id), {
    id: String(team._id), name: team.name + (team.active === false ? ' (inactive)' : ''),
  }]));
  for (const row of aggregates) {
    const id = row._id.team;
    if (!options.has(id)) options.set(id, { id, name: id === UNKNOWN ? 'Team not recorded'
      : id === UNASSIGNED ? 'No team' : `Deleted team (${id})` });
  }
  // Allow filtering new activity without a team even when the selected range is empty.
  if (!options.has(UNASSIGNED)) options.set(UNASSIGNED, { id: UNASSIGNED, name: 'No team' });
  if (!options.has(UNKNOWN)) options.set(UNKNOWN, { id: UNKNOWN, name: 'Team not recorded' });
  const rowsByTeam = new Map();
  for (const row of aggregates) {
    if (!rowsByTeam.has(row._id.team)) rowsByTeam.set(row._id.team, []);
    rowsByTeam.get(row._id.team).push(row);
  }
  return [...options.values()].sort((a, b) => {
    const special = (id) => id === UNKNOWN ? 2 : id === UNASSIGNED ? 1 : 0;
    return special(a.id) - special(b.id) || a.name.localeCompare(b.name);
  }).map((team) => {
    const rows = rowsByTeam.get(team.id) || [];
    const since = team.id === UNKNOWN ? trackingStartedAt : teamTrackingStartedAt;
    const report = formatReport(range, rows, since, now);
    const shared = formatReport(range, rows.map((row) => ({
      ...row, actions: row.shared,
      uniqueSubjects: row._id.kind === 'login' ? row.sharedSubjects : row.shared,
    })), since, now);
    return { ...team, ...report, shared: shared.totals };
  });
}

module.exports = { buildTeamPipeline, formatTeams };
