// Handles CRUD requests for teams.
const Team = require('../../models/team');
const User = require('../../models/user');

// Get all teams
exports.team_list = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

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

// Create a team
exports.team_create = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

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
