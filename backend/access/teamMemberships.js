'use strict';

const TEAM_MEMBERSHIP_ROLES = Object.freeze([
  'viewer',
  'monitor',
  'team_lead',
]);

const TEAM_PERMISSION_KEYS = Object.freeze([
  'view data',
  'edit data',
  'manage incident access',
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

const normalizeTeamPermissionList = (permissions) => {
  if (!Array.isArray(permissions)) return [];
  const known = new Set(TEAM_PERMISSION_KEYS);
  return [...new Set(permissions.filter((permission) => known.has(permission)))];
};

const getExplicitMemberships = (user) => {
  if (!user || !Array.isArray(user.teamMemberships)) return [];

  return user.teamMemberships
    .map((membership) => ({
      team: normalizeId(membership && membership.team),
      role: normalizeTeamRole(membership && membership.role),
      permissionOverrides: {
        allow: normalizeTeamPermissionList(
          membership && membership.permissionOverrides && membership.permissionOverrides.allow
        ),
        deny: normalizeTeamPermissionList(
          membership && membership.permissionOverrides && membership.permissionOverrides.deny
        ),
      },
    }))
    .filter((membership) => membership.team);
};

const getTeamPermissions = (
  user,
  teamId,
  explicitlyLedTeamIds = [],
  teamSettingsById = new Map()
) => {
  const normalizedTeamId = normalizeId(teamId);
  const role = getMembershipRole(user, normalizedTeamId, explicitlyLedTeamIds);
  if (!role) return [];

  const permissions = new Set(TEAM_ROLE_PERMISSIONS[role]);
  const membership = getExplicitMemberships(user)
    .find((item) => item.team === normalizedTeamId);

  if (membership) {
    membership.permissionOverrides.allow.forEach((permission) => permissions.add(permission));
    membership.permissionOverrides.deny.forEach((permission) => permissions.delete(permission));
  }

  const teamSettings = teamSettingsById instanceof Map
    ? teamSettingsById.get(normalizedTeamId)
    : teamSettingsById[normalizedTeamId];
  const teamDenied = normalizeTeamPermissionList(
    teamSettings && teamSettings.permissionLimits && teamSettings.permissionLimits.deny
  );
  teamDenied.forEach((permission) => permissions.delete(permission));

  return [...permissions];
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
  explicitlyLedTeamIds = [],
  teamSettingsById = new Map()
) => {
  const candidateTeamIds = [
    ...getMembershipTeamIds(user),
    ...explicitlyLedTeamIds.map(normalizeId).filter(Boolean),
  ];

  return [...new Set(candidateTeamIds)].filter((teamId) => {
    return getTeamPermissions(
      user,
      teamId,
      explicitlyLedTeamIds,
      teamSettingsById
    ).includes(permission);
  });
};

module.exports = {
  TEAM_MEMBERSHIP_ROLES,
  TEAM_PERMISSION_KEYS,
  TEAM_ROLE_PERMISSIONS,
  getExplicitMemberships,
  getMembershipRole,
  getMembershipTeamIds,
  getTeamIdsWithPermission,
  getTeamPermissions,
  normalizeTeamPermissionList,
  normalizeTeamRole,
};
