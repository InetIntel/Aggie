'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { getMembershipTeamIds } = require('../../access/teamMemberships');
const context = new AsyncLocalStorage();

function middleware(req, res, next) {
  context.run({ user: req.user, snapshots: new Map() }, next);
}

async function attribution(explicitUser) {
  const store = context.getStore();
  const user = explicitUser || store?.user;
  const id = user?._id || user?.id;
  if (!id) return {};
  const load = async () => {
    // Auth tokens don't carry current memberships. Read them once per request.
    const User = require('../../models/user');
    const Team = require('../../models/team');
    const account = await User.findById(id).select('teams teamMemberships').lean().exec();
    if (!account) return { actor: String(id) };
    const teams = await Team.find({ active: { $ne: false }, $or: [
      { _id: { $in: getMembershipTeamIds(account) } }, { leads: id },
    ] }).select('_id').lean().exec();
    return { actor: String(id), teamIds: [...new Set(teams.map((team) => String(team._id)))] };
  };
  if (explicitUser || !store) return load();
  if (!store.snapshots.has(String(id))) store.snapshots.set(String(id), load());
  return store.snapshots.get(String(id));
}

module.exports = { middleware, attribution };
