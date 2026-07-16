// Handles CRUD requests for teams.
const User = require('../../models/user');
const Team = require('../../models/team');

const assignableRoles = ['viewer', 'monitor', 'team_lead'];

const canManageTeams = (user) => {
  return user && ['admin', 'team_lead'].includes(user.role);
};

// Get all teams
exports.team_list = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  if (!canManageTeams(req.user)) {
    return res.status(403).send('Unauthorized to view teams.');
  }

  Team.find({})
    .sort({ name: 1 })
    .lean()
    .exec((err, teams) => {
      if (err) {
        return res
          .status(err.status || 500)
          .send(err.message || 'Team query failed');
      }

      return res.status(200).send(teams);
    });
};

// Get teams the current user can manage
exports.team_manageable_list = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  try {
    if (req.user.role === 'admin') {
      const teams = await Team.find({})
        .sort({ name: 1 })
        .lean();

      return res.status(200).send(teams);
    }

    if (req.user.role === 'team_lead') {
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

    return res.status(403).send('Unauthorized to view manageable teams.');
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Manageable team query failed');
  }
};

// Get a team with its assigned users
exports.team_detail = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  if (!canManageTeams(req.user)) {
  return res.status(403).send('Unauthorized to view team details.');
}
  try {
    const team = await Team.findById(req.params._id)
      .lean();

    if (!team) {
      return res.sendStatus(404);
    }

    const members = await User.find({ teams: req.params._id })
      .select('_id username displayName email role createdBy')
      .sort({ role: 1, username: 1 })
      .lean();

    return res.status(200).send({
      team,
      members,
    });
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

  if (!canManageTeams(req.user)) {
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

  if (!canManageTeams(req.user)) {
    return res.status(403).send('Unauthorized to manage team members.');
  }

  const userId = req.body.userId;
  const role = req.body.role;

  if (!userId) {
    return res.status(400).send('Please provide a userId.');
  }

  if (!assignableRoles.includes(role)) {
    return res.status(400).send('Role must be viewer, monitor, or team_lead.');
  }

  try {
    const team = await Team.findById(req.params._id).lean();

    if (!team) {
      return res.sendStatus(404);
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).send('User not found.');
    }

    if (user.role === 'admin') {
      return res.status(403).send('Admin users cannot be assigned from the team page.');
    }

    user.role = role;
    user.teams = user.teams || [];

    const alreadyInTeam = user.teams.some(
      (teamId) => String(teamId) === String(req.params._id)
    );

    if (!alreadyInTeam) {
      user.teams.push(req.params._id);
    }

    await user.save();

    const members = await User.find({ teams: req.params._id })
      .select('_id username displayName email role createdBy')
      .sort({ role: 1, username: 1 })
      .lean();

    return res.status(200).send({
      team,
      members,
    });
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Team member update failed');
  }
};

// Remove a user from a team
exports.team_remove_member = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  if (!canManageTeams(req.user)) {
    return res.status(403).send('Unauthorized to manage team members.');
  }

  try {
    const team = await Team.findById(req.params._id).lean();

    if (!team) {
      return res.sendStatus(404);
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

    const members = await User.find({ teams: req.params._id })
      .select('_id username displayName email role createdBy')
      .sort({ role: 1, username: 1 })
      .lean();

    return res.status(200).send({
      team,
      members,
    });
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Team member removal failed');
  }
};

// Delete a team
exports.team_delete = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

if (!canManageTeams(req.user)) {
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