'use strict';

const Team = require('../../models/team');
const User = require('../../models/user');
const { getMembershipTeamIds } = require('../../access/teamMemberships');

const getSourceAccessUser = async (req) => {
  if (req.sourceAccessUser) return req.sourceAccessUser;

  let user = req.accessUser;
  if (!user && req.user) {
    user = await User.findById(req.user._id || req.user.id)
      .select('_id role teams teamMemberships permissionOverrides active')
      .lean();
  }

  if (!user || user.role === 'admin') {
    req.sourceAccessUser = user || null;
    return req.sourceAccessUser;
  }

  const userId = user._id || user.id;
  const membershipTeamIds = getMembershipTeamIds(user);
  const teamMatches = [];

  if (membershipTeamIds.length > 0) {
    teamMatches.push({ _id: { $in: membershipTeamIds } });
  }
  if (userId) {
    teamMatches.push({ leads: userId });
  }

  const teams = teamMatches.length > 0
    ? await Team.find({
        active: { $ne: false },
        $or: teamMatches,
      })
      .select('_id countryCodes')
      .lean()
    : [];

  const plainUser = typeof user.toObject === 'function' ? user.toObject() : user;
  req.sourceAccessUser = {
    ...plainUser,
    teamCountryCodes: [...new Set(
      teams.flatMap((team) => team.countryCodes || [])
        .map((code) => String(code).toUpperCase())
    )],
  };

  return req.sourceAccessUser;
};

module.exports = { getSourceAccessUser };
