// Handles CRUD requests for teams.
const User = require('../../models/user');
const Team = require('../../models/team');
const {
  canCreateOrDeleteTeams,
  canManageTeam,
  isAdmin,
  isLegacyTeamLead,
  normalizeIds,
} = require('../../access/teamAccess');
const { hasPermission } = require('../../access/permissions');

const assignableRoles = ['viewer', 'monitor', 'team_lead_scoped', 'team_lead'];

const serializeTeamDetail = (team, members) => {
  const plainTeam = typeof team.toObject === 'function' ? team.toObject() : team;
  const leadIds = new Set(normalizeIds(plainTeam.leads));

  return {
    team: plainTeam,
    members: members.map((member) => ({
      ...member,
      isTeamLead: leadIds.has(String(member._id)),
    })),
  };
};

// Get all teams
exports.team_list = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  try {
    const filter = isAdmin(req.user) || isLegacyTeamLead(req.user)
      ? {}
      : { leads: req.user._id };
    const teams = await Team.find(filter).sort({ name: 1 }).lean();
    return res.status(200).send(teams);
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Team query failed');
  }
};

// Get teams the current user can manage
exports.team_manageable_list = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  try {
    if (isAdmin(req.user)) {
      const teams = await Team.find({})
        .sort({ name: 1 })
        .lean();

      return res.status(200).send(teams);
    }

    if (isLegacyTeamLead(req.user)) {
      const actor = await User.findById(req.user._id)
        .select('teams')
        .lean();

      if (!actor) return res.status(401).send('Unauthenticated.');

      const teamIds = actor.teams || [];

      const teams = await Team.find({ _id: { $in: teamIds } })
        .sort({ name: 1 })
        .lean();

      return res.status(200).send(teams);
    }

    const teams = await Team.find({ leads: req.user._id })
      .sort({ name: 1 })
      .lean();

    return res.status(200).send(teams);
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Manageable team query failed');
  }
};

// Get a team with its assigned users
exports.team_detail = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  try {
    const team = await Team.findById(req.params._id)
      .lean();

    if (!team) {
      return res.sendStatus(404);
    }

    if (!canManageTeam(req.user, team)) {
      return res.status(403).send('Unauthorized to view team details.');
    }

    const members = await User.find({ teams: req.params._id })
      .select('_id username displayName email role createdBy')
      .sort({ role: 1, username: 1 })
      .lean();

    return res.status(200).send(serializeTeamDetail(team, members));
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).send('Invalid team id.');
    }

    return res
      .status(err.status || 500)
      .send(err.message || 'Team detail query failed');
  }
};

// Create a team
exports.team_create = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  if (!canCreateOrDeleteTeams(req.user)) {
    return res.status(403).send('Unauthorized to create teams.');
  }

  const payload = {
    name: req.body.name,
    description: req.body.description || '',
    active: typeof req.body.active === 'boolean' ? req.body.active : true,
  };

  Team.create(payload, (err, team) => {
    if (err) {
      return res
        .status(err.status || 500)
        .send(err.message || 'Team creation failed');
    }

    return res.status(201).send(team);
  });
};

// Add or update a user's membership in a team
exports.team_add_member = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  const userId = req.body.userId;
  const role = req.body.role;

  if (!userId) {
    return res.status(400).send('Please provide a userId.');
  }

  if (!assignableRoles.includes(role)) {
    return res.status(400).send('Role must be viewer, monitor, team_lead_scoped, or team_lead.');
  }

  try {
    const team = await Team.findById(req.params._id);

    if (!team) {
      return res.sendStatus(404);
    }

    if (!canManageTeam(req.user, team)) {
      return res.status(403).send('Unauthorized to manage team members.');
    }

    if (
      ['team_lead_scoped', 'team_lead'].includes(role) &&
      !isAdmin(req.user) &&
      !isLegacyTeamLead(req.user)
    ) {
      return res.status(403).send('Only administrators and legacy team leads can appoint team leads during migration.');
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).send('User not found.');
    }

    if (user.role === 'admin') {
      return res.status(403).send('Admin users cannot be assigned from the team page.');
    }

    if (
      !isAdmin(req.user) &&
      !isLegacyTeamLead(req.user) &&
      role !== user.role
    ) {
      return res.status(403).send('Scoped team leads cannot change global user roles.');
    }

    user.teams = user.teams || [];

    const alreadyInTeam = user.teams.some(
      (teamId) => String(teamId) === String(req.params._id)
    );

    if (!alreadyInTeam) {
      user.teams.push(req.params._id);
    }

    if (role === 'team_lead_scoped') {
      team.leads.addToSet(user._id);
    } else if (role === 'team_lead') {
      user.role = role;
      team.leads.addToSet(user._id);
    } else {
      user.role = role;
      team.leads.pull(user._id);
    }

    await user.save();
    await team.save();

    const members = await User.find({ teams: req.params._id })
      .select('_id username displayName email role createdBy')
      .sort({ role: 1, username: 1 })
      .lean();

    return res.status(200).send(serializeTeamDetail(team, members));
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Team member update failed');
  }
};

// Remove a user from a team
exports.team_remove_member = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  try {
    const team = await Team.findById(req.params._id);

    if (!team) {
      return res.sendStatus(404);
    }

    if (!canManageTeam(req.user, team)) {
      return res.status(403).send('Unauthorized to manage team members.');
    }

    const user = await User.findById(req.params.userId).select('-password');

    if (!user) {
      return res.status(404).send('User not found.');
    }

    if (user.role === 'admin') {
      return res.status(403).send('Admin users cannot be removed from teams here.');
    }

    await User.findByIdAndUpdate(req.params.userId, {
      $pull: { teams: req.params._id },
    });
    team.leads.pull(req.params.userId);
    await team.save();

    const members = await User.find({ teams: req.params._id })
      .select('_id username displayName email role createdBy')
      .sort({ role: 1, username: 1 })
      .lean();

    return res.status(200).send(serializeTeamDetail(team, members));
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Team member removal failed');
  }
};

// Delete a team
exports.team_delete = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

if (!canCreateOrDeleteTeams(req.user)) {
  return res.status(403).send('Unauthorized to delete teams.');
}

  try {
    const team = await Team.findById(req.params._id).lean();

    if (!team) {
      return res.sendStatus(404);
    }

    await User.updateMany(
      { teams: req.params._id },
      { $pull: { teams: req.params._id } }
    );

    await Team.findByIdAndDelete(req.params._id);

    return res.status(200).send({ message: 'Team deleted.' });
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Team deletion failed');
  }
};

// Get only the team names the current user may use in an incident policy.
exports.team_incident_access_list = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  try {
    const filter = hasPermission(req.user, 'manage incident access')
      ? { active: true }
      : { active: true, leads: req.user._id };
    const teams = await Team.find(filter)
      .select('_id name description active')
      .sort({ name: 1 })
      .lean();

    return res.status(200).send(teams);
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Incident access team query failed');
  }
};
