'use strict';

const TEAM_MEMBERSHIP_ROLES = Object.freeze([
  'viewer',
  'monitor',
  'team_lead',
]);

const TEAM_ROLE_PERMISSIONS = Object.freeze({
  viewer: ['view data'],
  monitor: ['view data', 'edit data'],
  team_lead: ['view data', 'edit data', 'manage incident access'],
});

const normalizeId = (value) => {
  if (!value) return null;
  return String(value._id || value);
};

const normalizeTeamRole = (role) => {
  if (role === 'team_lead' || role === 'team_lead_scoped') return 'team_lead';
  if (role === 'monitor') return 'monitor';
  return 'viewer';
};

const getExplicitMemberships = (user) => {
  if (!user || !Array.isArray(user.teamMemberships)) return [];

  return user.teamMemberships
    .map((membership) => ({
      team: normalizeId(membership && membership.team),
      role: normalizeTeamRole(membership && membership.role),
    }))
    .filter((membership) => membership.team);
};

const getMembershipRole = (user, teamId, explicitlyLedTeamIds = []) => {
  const normalizedTeamId = normalizeId(teamId);
  if (!normalizedTeamId || !user) return null;

  const ledTeamIds = new Set(explicitlyLedTeamIds.map(normalizeId).filter(Boolean));
  if (ledTeamIds.has(normalizedTeamId)) return 'team_lead';

  const explicitMembership = getExplicitMemberships(user)
    .find((membership) => membership.team === normalizedTeamId);
  if (explicitMembership) return explicitMembership.role;

  const legacyTeamIds = new Set(
    (Array.isArray(user.teams) ? user.teams : [])
      .map(normalizeId)
      .filter(Boolean)
  );
  if (!legacyTeamIds.has(normalizedTeamId)) return null;

  // Compatibility fallback for memberships created before scoped roles existed.
  return normalizeTeamRole(user.role);
};

const getMembershipTeamIds = (user) => {
  const ids = [
    ...getExplicitMemberships(user).map((membership) => membership.team),
    ...(Array.isArray(user && user.teams) ? user.teams.map(normalizeId) : []),
  ].filter(Boolean);

  return [...new Set(ids)];
};

const getTeamIdsWithPermission = (
  user,
  permission,
  explicitlyLedTeamIds = []
) => {
  const candidateTeamIds = [
    ...getMembershipTeamIds(user),
    ...explicitlyLedTeamIds.map(normalizeId).filter(Boolean),
  ];

  return [...new Set(candidateTeamIds)].filter((teamId) => {
    const role = getMembershipRole(user, teamId, explicitlyLedTeamIds);
    return role && TEAM_ROLE_PERMISSIONS[role].includes(permission);
  });
};

module.exports = {
  TEAM_MEMBERSHIP_ROLES,
  TEAM_ROLE_PERMISSIONS,
  getExplicitMemberships,
  getMembershipRole,
  getMembershipTeamIds,
  getTeamIdsWithPermission,
  normalizeTeamRole,
};
