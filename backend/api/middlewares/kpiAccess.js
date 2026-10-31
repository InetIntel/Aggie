'use strict';

const User = require('../../models/user');
const Team = require('../../models/team');
const { getKpiAccess } = require('../../access/kpiAccess');

async function requireKpiAccess(req, res, next) {
  if (!req.user) return res.sendStatus(401);
  try {
    const user = await User.findById(req.user._id || req.user.id)
      .select('_id role active teams teamMemberships permissionOverrides').lean().exec();
    if (!user || user.active === false) return res.sendStatus(401);
    const teams = await Team.find({}).select('_id name active leads permissionLimits').lean().exec();
    const ledIds = teams.filter((team) => (team.leads || []).some((id) => String(id) === String(user._id))).map((team) => String(team._id));
    req.kpiAccess = getKpiAccess(user, teams, ledIds);
    if (!req.kpiAccess.canView) return res.sendStatus(403);
    req.kpiTeams = req.kpiAccess.global ? teams : teams.filter((team) => req.kpiAccess.teamIds.includes(String(team._id)));
    return next();
  } catch (error) {
    console.error('Unable to verify KPI access', error);
    return res.status(500).send('Unable to verify KPI access.');
  }
}

module.exports = { requireKpiAccess };
