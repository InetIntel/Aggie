'use strict';

const { hasPermission } = require('./permissions');
const { getMembershipTeamIds } = require('./teamMemberships');

const normalizeIds = (values) => {
  if (!Array.isArray(values)) return [];

  return values
    .filter(Boolean)
    .map((value) => String(value._id || value));
};

const isAdmin = (user) => Boolean(user && user.role === 'admin');

const getIncidentPolicy = (incident) => {
  if (!incident || !incident.accessPolicy) {
    return { mode: 'public', teams: [] };
  }

  return {
    mode: incident.accessPolicy.mode || 'public',
    teams: normalizeIds(incident.accessPolicy.teams),
  };
};

const getAccessibleTeamIds = (user, explicitlyLedTeamIds = []) => {
  const teamIds = [
    ...getMembershipTeamIds(user),
    ...normalizeIds(explicitlyLedTeamIds),
  ];

  return [...new Set(teamIds)];
};

const hasTeamOverlap = (firstIds, secondIds) => {
  const first = new Set(firstIds);
  return secondIds.some((id) => first.has(id));
};

const canViewIncident = (user, incident, explicitlyLedTeamIds = []) => {
  if (isAdmin(user)) return true;

  const policy = getIncidentPolicy(incident);
  if (policy.mode === 'public') return true;
  if (policy.mode !== 'restricted' || policy.teams.length === 0) return false;

  return hasTeamOverlap(
    getAccessibleTeamIds(user, explicitlyLedTeamIds),
    policy.teams
  );
};

const canModifyIncidentWithScope = (scope, incident) => {
  if (!scope || scope.permission !== 'edit data' || !incident) return false;
  if (scope.global === true) return true;

  const policy = getIncidentPolicy(incident);
  if (policy.mode === 'public') return scope.allowUnscoped === true;

  return policy.mode === 'restricted' && hasTeamOverlap(
    normalizeIds(scope.teamIds),
    policy.teams
  );
};

const buildIncidentAccessFilter = (user, explicitlyLedTeamIds = []) => {
  if (isAdmin(user)) return {};

  const accessibleTeamIds = getAccessibleTeamIds(user, explicitlyLedTeamIds);
  const clauses = [
    { 'accessPolicy.mode': { $exists: false } },
    { 'accessPolicy.mode': 'public' },
  ];

  if (accessibleTeamIds.length > 0) {
    clauses.push({
      'accessPolicy.mode': 'restricted',
      'accessPolicy.teams': { $in: accessibleTeamIds },
    });
  }

  return { $or: clauses };
};

const canSetIncidentPolicy = (
  user,
  nextPolicy,
  explicitlyLedTeamIds = [],
  currentIncident = null
) => {
  if (isAdmin(user) || hasPermission(user, 'manage incident access')) {
    return true;
  }
  const next = getIncidentPolicy({ accessPolicy: nextPolicy });
  const current = currentIncident ? getIncidentPolicy(currentIncident) : null;

  if (current) {
    const currentTeams = [...current.teams].sort();
    const nextTeams = [...next.teams].sort();
    if (
      current.mode === next.mode &&
      currentTeams.length === nextTeams.length &&
      currentTeams.every((id, index) => id === nextTeams[index])
    ) {
      return true;
    }
  }

  if (user && user.role === 'team_lead') return false;

  const ledTeamIds = normalizeIds(explicitlyLedTeamIds);
  if (ledTeamIds.length === 0) return false;
  const ledTeams = new Set(ledTeamIds);

  if (next.mode === 'restricted') {
    if (next.teams.length === 0) return false;
    if (!current || current.mode === 'public') {
      return next.teams.every((id) => ledTeams.has(id));
    }

    const unmanagedCurrentTeams = current.teams.filter((id) => !ledTeams.has(id));
    const unmanagedNextTeams = next.teams.filter((id) => !ledTeams.has(id));

    return unmanagedCurrentTeams.length === unmanagedNextTeams.length &&
      unmanagedCurrentTeams.every((id) => unmanagedNextTeams.includes(id));
  }

  if (next.mode === 'public') {
    if (!currentIncident) return true;

    return current.mode === 'restricted' &&
      current.teams.length > 0 &&
      current.teams.every((id) => ledTeams.has(id));
  }

  return false;
};

module.exports = {
  buildIncidentAccessFilter,
  canModifyIncidentWithScope,
  canSetIncidentPolicy,
  canViewIncident,
  getAccessibleTeamIds,
  getIncidentPolicy,
  normalizeIds,
};
