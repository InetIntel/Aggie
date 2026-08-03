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

module.exports = {
  canCreateOrDeleteTeams,
  canManageTeam,
  isAdmin,
  isExplicitTeamLead,
  isLegacyTeamLead,
  normalizeIds,
};
