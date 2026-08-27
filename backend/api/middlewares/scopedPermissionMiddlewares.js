'use strict';

const User = require('../../models/user');
const Team = require('../../models/team');
const { hasPermission } = require('../../access/permissions');
const {
  getMembershipTeamIds,
  getTeamIdsWithPermission,
} = require('../../access/teamMemberships');

const allowGlobalOrScoped = (permission) => async (req, res, next) => {
  if (String(process.env.ADMIN_PARTY).toLowerCase() === 'true') {
    req.accessUser = {
      _id: req.user && (req.user._id || req.user.id),
      role: 'admin',
      teams: [],
      teamMemberships: [],
    };
    req.permissionScope = null;
    return next();
  }

  if (!req.user) return res.status(401).send('Authentication required.');

  try {
    const user = await User.findById(req.user._id || req.user.id)
      .select('_id role teams teamMemberships permissionOverrides active')
      .lean();

    if (!user || !user.active) {
      return res.status(401).send('User account is unavailable.');
    }

    req.accessUser = user;
    const hasGlobalPermission = hasPermission(user, permission);
    if (user.role === 'admin' || user.role === 'team_lead') {
      req.permissionScope = null;
      return next();
    }

    const ledTeams = await Team.find({ leads: user._id })
      .select('_id permissionLimits')
      .lean();
    const ledTeamIds = ledTeams.map((team) => String(team._id));
    const candidateTeamIds = [...new Set([
      ...getMembershipTeamIds(user),
      ...ledTeamIds,
    ])];
    const teams = await Team.find({ _id: { $in: candidateTeamIds } })
      .select('_id permissionLimits')
      .lean();
    const teamSettings = new Map(
      teams.map((team) => [String(team._id), team])
    );
    const teamIds = getTeamIdsWithPermission(
      user,
      permission,
      ledTeamIds,
      teamSettings
    );

    if (!hasGlobalPermission && teamIds.length === 0) {
      return res.status(403).send(`You are not authorized to ${permission}.`);
    }

    req.permissionScope = {
      permission,
      teamIds,
      allowUnscoped: hasGlobalPermission,
    };
    return next();
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to verify scoped permissions.');
  }
};

module.exports = { allowGlobalOrScoped };
