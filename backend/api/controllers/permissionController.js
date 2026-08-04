'use strict';

const User = require('../../models/user');
const {
  PERMISSION_KEYS,
  getEffectivePermissions,
  getRolePermissions,
  normalizePermissionList,
} = require('../../access/permissions');

const serializePermissionSettings = (user) => {
  const roleDefaults = new Set(getRolePermissions(user.role));
  const effective = new Set(getEffectivePermissions(user));
  const allowed = new Set(
    normalizePermissionList(user.permissionOverrides?.allow)
  );
  const denied = new Set(
    normalizePermissionList(user.permissionOverrides?.deny)
  );

  return {
    userId: String(user._id),
    role: user.role,
    editable: user.role !== 'admin',
    permissions: PERMISSION_KEYS.map((permission) => ({
      permission,
      roleDefault: roleDefaults.has(permission),
      effective: effective.has(permission),
      override: denied.has(permission)
        ? 'deny'
        : allowed.has(permission)
          ? 'allow'
          : 'default',
    })),
  };
};

exports.permission_user_detail = async (req, res) => {
  try {
    const user = await User.findById(req.params._id)
      .select('_id role permissionOverrides')
      .lean();

    if (!user) return res.sendStatus(404);
    return res.status(200).send(serializePermissionSettings(user));
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to load user permissions.');
  }
};

exports.permission_user_update = async (req, res) => {
  if (!Array.isArray(req.body.allow) || !Array.isArray(req.body.deny)) {
    return res.status(400).send('Allow and deny must both be arrays.');
  }

  const submitted = [...req.body.allow, ...req.body.deny];
  const knownPermissions = new Set(PERMISSION_KEYS);
  if (submitted.some((permission) => !knownPermissions.has(permission))) {
    return res.status(400).send('One or more permissions are invalid.');
  }

  const allow = normalizePermissionList(req.body.allow);
  const deny = normalizePermissionList(req.body.deny);
  const denied = new Set(deny);
  if (allow.some((permission) => denied.has(permission))) {
    return res
      .status(400)
      .send('A permission cannot be both allowed and denied.');
  }

  try {
    const user = await User.findById(req.params._id);
    if (!user) return res.sendStatus(404);
    if (user.role === 'admin') {
      return res.status(400).send('Administrator permissions cannot be overridden.');
    }

    user.permissionOverrides = { allow, deny };
    await user.save();

    return res.status(200).send(serializePermissionSettings(user));
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to update user permissions.');
  }
};

exports.serializePermissionSettings = serializePermissionSettings;
