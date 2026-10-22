'use strict';

// These role mappings preserve Aggie's current behavior. Roles act as default
// permission templates; per-user overrides can then grant or deny individual
// permissions without changing the user's role.
const PERMISSION_ROLES = Object.freeze({
  'manage trends': ['admin'],
  'view data': ['viewer', 'monitor', 'admin', 'team_lead'],
  'edit data': ['monitor', 'admin', 'team_lead'],
  'change settings': ['admin', 'team_lead'],
  'manage sources': ['admin'],
  'manage incident access': ['admin', 'team_lead'],
  'view users': ['viewer', 'monitor', 'admin', 'team_lead'],
  'view other users': ['manager', 'admin', 'team_lead'],
  'update users': ['viewer', 'monitor', 'admin'],
  'delete users': ['admin', 'team_lead'],
  'admin users': ['admin'],
  'change admin password': ['admin'],
  'edit tags': ['manager', 'admin'],
});

const PERMISSION_KEYS = Object.freeze(Object.keys(PERMISSION_ROLES));

// These account controls stay with administrators.
const ADMIN_ONLY_PERMISSIONS = Object.freeze(['admin users', 'change admin password']);
const OVERRIDABLE_PERMISSION_KEYS = Object.freeze(
  PERMISSION_KEYS.filter((permission) => !ADMIN_ONLY_PERMISSIONS.includes(permission))
);

const normalizePermissionList = (values) => {
  if (!Array.isArray(values)) return [];
  const knownPermissions = new Set(PERMISSION_KEYS);
  return [...new Set(values.filter((value) => knownPermissions.has(value)))];
};

const getRolePermissions = (role) => {
  return PERMISSION_KEYS.filter((permission) =>
    PERMISSION_ROLES[permission].includes(role)
  );
};

const getEffectivePermissions = (user) => {
  if (!user) return [];

  // Admins remain unrestricted and cannot accidentally lock themselves out
  // through an override.
  if (user.role === 'admin') return [...PERMISSION_KEYS];

  const effective = new Set(getRolePermissions(user.role));
  const overrides = user.permissionOverrides || {};
  const allowed = normalizePermissionList(overrides.allow);
  const denied = normalizePermissionList(overrides.deny);

  allowed.forEach((permission) => effective.add(permission));
  // An explicit deny wins when the same permission appears in both lists.
  denied.forEach((permission) => effective.delete(permission));

  return OVERRIDABLE_PERMISSION_KEYS.filter((permission) => effective.has(permission));
};

const hasPermission = (user, permission) => {
  if (!PERMISSION_ROLES[permission]) return false;
  return getEffectivePermissions(user).includes(permission);
};

module.exports = {
  ADMIN_ONLY_PERMISSIONS,
  OVERRIDABLE_PERMISSION_KEYS,
  PERMISSION_KEYS,
  PERMISSION_ROLES,
  getEffectivePermissions,
  getRolePermissions,
  hasPermission,
  normalizePermissionList,
};
