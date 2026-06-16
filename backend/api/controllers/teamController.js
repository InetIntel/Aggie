// Handles CRUD requests for teams.
const Team = require('../../models/team');

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
