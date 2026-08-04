'use strict';

const normalizeIds = (values) => {
  if (!Array.isArray(values)) return [];

  return values
    .filter(Boolean)
    .map((value) => String(value._id || value));
};

const isAdmin = (user) => Boolean(user && user.role === 'admin');

const isLegacyTeamLead = (user) => Boolean(
  user && user.role === 'team_lead'
);

const isExplicitTeamLead = (user, team) => {
  if (!user || !team) return false;
  const userId = String(user._id || user.id || '');
  return normalizeIds(team.leads).includes(userId);
};

const canManageTeam = (user, team) => {
  return isAdmin(user) || isLegacyTeamLead(user) || isExplicitTeamLead(user, team);
};

const canCreateOrDeleteTeams = (user) => {
  // Compatibility fallback: global team leads retain their current capability
  // until all existing assignments have been migrated and verified.
  return isAdmin(user) || isLegacyTeamLead(user);
};

const canCreateUsers = (user, explicitlyLedTeamIds = []) => {
  return isAdmin(user) ||
    isLegacyTeamLead(user) ||
    normalizeIds(explicitlyLedTeamIds).length > 0;
};

const canCreateUserRole = (user, role) => {
  if (isAdmin(user)) {
    return ['viewer', 'monitor', 'admin', 'team_lead'].includes(role);
  }

  return ['viewer', 'monitor'].includes(role);
};

const canAssignCreatedUserToTeams = (
  user,
  requestedTeamIds = [],
  explicitlyLedTeamIds = []
) => {
  if (isAdmin(user) || isLegacyTeamLead(user)) return true;

  const requestedIds = normalizeIds(requestedTeamIds);
  if (requestedIds.length === 0) return false;

  const ledIds = new Set(normalizeIds(explicitlyLedTeamIds));
  return requestedIds.every((teamId) => ledIds.has(teamId));
};

module.exports = {
  canAssignCreatedUserToTeams,
  canCreateOrDeleteTeams,
  canCreateUserRole,
  canCreateUsers,
  canManageTeam,
  isAdmin,
  isExplicitTeamLead,
  isLegacyTeamLead,
  normalizeIds,
};
