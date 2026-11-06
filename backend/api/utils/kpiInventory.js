'use strict';

const User = require('../../models/user');
const Group = require('../../models/group');
const Source = require('../../models/source');
const Report = require('../../models/report');
const { canViewSource } = require('../../access/sourceAccess');
const { buildIncidentAccessFilter } = require('../../access/incidentAccess');

async function getInventory(access, teams, selectedIds, range) {
  if (selectedIds.some((id) => ['unknown', 'unassigned'].includes(id))) {
    return { available: false };
  }
  const global = access.global && !selectedIds.length;
  const ids = selectedIds.length ? selectedIds : access.teamIds;
  const selectedTeams = global ? teams : teams.filter((team) => ids.includes(String(team._id)));
  const scopeUser = global ? { role: 'admin' } : {
    role: 'viewer', teams: selectedTeams.map((team) => String(team._id)),
    teamCountryCodes: selectedTeams.flatMap((team) => team.countryCodes || []),
  };
  const userFilter = global ? {} : { $or: [
    { teams: { $in: scopeUser.teams } },
    { 'teamMemberships.team': { $in: scopeUser.teams } },
    { _id: { $in: selectedTeams.flatMap((team) => team.leads || []) } },
  ] };
  const [users, incidents, sources] = await Promise.all([
    User.countDocuments(userFilter).exec(),
    Group.countDocuments(buildIncidentAccessFilter(scopeUser)).exec(),
    Source.find({}).select('_id nickname media enabled accessPolicy countryCodes').lean().exec(),
  ]);
  const visibleSources = sources.filter((source) => canViewSource(scopeUser, source));
  const sourceIds = visibleSources.map((source) => String(source._id));
  const counts = sourceIds.length ? await Report.aggregate([
    { $match: { storedAt: { $gte: range.start, $lt: range.end }, _sources: { $in: sourceIds } } },
    { $project: { isOutageEvent: 1, sources: { $setIntersection: ['$_sources', sourceIds] } } },
    { $unwind: '$sources' },
    { $group: { _id: '$sources',
      alerts: { $sum: { $cond: [{ $eq: ['$isOutageEvent', true] }, 1, 0] } },
      social: { $sum: { $cond: [{ $eq: ['$isOutageEvent', true] }, 0, 1] } },
    } },
  ]).exec() : [];
  const byId = new Map(counts.map((row) => [row._id, row]));
  const policies = { public: 0, restricted: 0, country_restricted: 0, public_until: 0 };
  visibleSources.forEach((source) => {
    const mode = source.accessPolicy?.mode || 'public';
    if (Object.hasOwn(policies, mode)) policies[mode]++;
  });
  return {
    available: true, asOf: new Date().toISOString(), global,
    users, incidents, sources: visibleSources.length,
    enabledSources: visibleSources.filter((source) => source.enabled !== false).length,
    policies,
    bySource: visibleSources.map((source) => ({
      id: String(source._id), name: source.nickname, media: source.media || '',
      alerts: byId.get(String(source._id))?.alerts || 0,
      social: byId.get(String(source._id))?.social || 0,
    })).sort((a, b) => (b.alerts + b.social) - (a.alerts + a.social) || a.name.localeCompare(b.name)),
  };
}

module.exports = { getInventory };
