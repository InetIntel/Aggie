// Handles CRUD requests for users.
var User = require('../../models/user');
const passport = require('passport');
const validator = require('validator');
const Team = require('../../models/team');
const database = require('../../database');
const mongoose = database.mongoose;
const {
  canAssignCreatedUserToTeams,
  canCreateUserRole,
  canCreateUsers,
} = require('../../access/teamAccess');
const { normalizeTeamRole } = require('../../access/teamMemberships');


// helpers for team items
const teamPopulate = {
  path: 'teams',
  select: 'name description active',
};

const teamMembershipPopulate = {
  path: 'teamMemberships.team',
  select: 'name description active',
};

const normalizeUserTeams = (user) => ({
  ...user,
  teams: user.teams || [],
});

const normalizeIds = (ids) => [
  ...new Set((ids || []).map((id) => String(id._id || id)).filter(Boolean)),
];

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);


// get user list
exports.user_users = (req, res) => {
  if (!req.user) return res.status(401).send("Unauthenticated.");

  User.find({})
    .select("-password")
    .populate([teamPopulate, teamMembershipPopulate])
    .lean()
    .exec((err, users) => {
      if (err) {
        return res
          .status(err.status || 500)
          .send(err.message || "User query failed");
      }
      return res.status(200).send(users.map(normalizeUserTeams));
    });
};

exports.user_directory = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  User.find({})
    .select('_id username displayName')
    .sort({ username: 1 })
    .lean()
    .exec((err, users) => {
      if (err) {
        return res
          .status(err.status || 500)
          .send(err.message || 'User directory query failed');
      }
      return res.status(200).send(users);
    });
};

// get manageble user list (for admin: all, for team lead: team lead + created users)
exports.user_manageableUsers = async (req, res) => {
  if (!req.user) return res.status(401).send("Unauthenticated.");

  try {
    const role = req.user.role;
    const self = req.user._id;
    let filter = { _id: self };
    let scopedTeamIds = null;

    if (role === "admin") {
      filter = {};
    } else if (role === "team_lead") {
      // Compatibility behavior: legacy global leads retain the existing user list.
      filter = {
        $or: [
          { _id: self },
          { role: { $in: ["viewer", "monitor"] } },
        ],
      };
    } else {
      const leadTeams = await Team.find({ leads: self }).select('_id').lean();
      scopedTeamIds = new Set(leadTeams.map((team) => String(team._id)));

      if (scopedTeamIds.size > 0) {
        const ledTeamIds = [...scopedTeamIds];
        filter = {
          $or: [
            { _id: self },
            { teams: { $in: ledTeamIds } },
            { 'teamMemberships.team': { $in: ledTeamIds } },
          ],
        };
      }
    }

    const users = await User.find(filter)
      .select('_id username displayName email role active teams teamMemberships createdBy')
      .populate([teamPopulate, teamMembershipPopulate])
      .lean();

    const normalizedUsers = users.map(normalizeUserTeams).map((user) => {
      if (!scopedTeamIds) return user;
      return {
        ...user,
        teams: user.teams.filter((team) => scopedTeamIds.has(String(team._id))),
        teamMemberships: (user.teamMemberships || []).filter((membership) =>
          scopedTeamIds.has(String(membership.team?._id || membership.team))
        ),
      };
    });

    return res.status(200).send(normalizedUsers);
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || "User query failed");
  }
};

exports.user_member_candidates = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  try {
    const role = req.user.role;
    if (role !== 'admin' && role !== 'team_lead') {
      const ledTeamCount = await Team.countDocuments({ leads: req.user._id });
      if (ledTeamCount === 0) {
        return res.status(403).send('Unauthorized to add team members.');
      }
    }

    const search = String(req.query.q || '').trim().slice(0, 64);
    if (search.length < 2) return res.status(200).send([]);

    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const roles = role === 'admin'
      ? ['viewer', 'monitor', 'team_lead', 'admin']
      : ['viewer', 'monitor'];
    const filter = {
      role: { $in: roles },
      $or: [
        { username: { $regex: escapedSearch, $options: 'i' } },
        { displayName: { $regex: escapedSearch, $options: 'i' } },
      ],
    };
    if (role !== 'admin') filter._id = { $ne: req.user._id };

    const users = await User.find(filter)
      .select('_id username displayName role')
      .sort({ username: 1 })
      .limit(10)
      .lean();

    return res.status(200).send(users);
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'User search failed');
  }
};

// Get a User by id
exports.user_detail = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  User.findById(req.params._id, '-password')
    .populate([teamPopulate, teamMembershipPopulate])
    .lean()
    .exec(function (err, user) {
      if (err) { return res.status(err.status).send(err.message); }
      else if (!user) { return res.sendStatus(404); }
      else {
        const isSelf = String(user._id) === String(req.user._id);
        const allowed = isSelf || User.hasPermission(
          req.accessUser || req.user,
          'view other users'
        );

        if (!allowed) return res.status(403).send('Unauthorized to view the user.');
        return res.status(200).send(normalizeUserTeams(user));
      }
    });
};

// Create a new User
exports.user_create = async (req, res) => {
  console.log(
    'Attempting to register user with username: ' +
    req.body.username +
    ' and email: ' +
    req.body.email +
    '.'
  );

  if (!req.user) return res.status(401).send('Unauthenticated.');

  if (!validator.isEmail(req.body.email)) {
    return res.status(400).send('Please provide a valid email.');
  }

  try {
    const actor = await User.findById(req.user._id)
      .select('_id role')
      .lean();

    if (!actor) return res.status(401).send('Unauthenticated.');

    if (req.body.teams !== undefined && !Array.isArray(req.body.teams)) {
      return res.status(400).send('Please provide teams as an array.');
    }

    const requestedTeamIds = normalizeIds(req.body.teams);
    if (requestedTeamIds.some((id) => !isValidObjectId(id))) {
      return res.status(400).send('One or more team ids are invalid.');
    }

    const explicitlyLedTeams = await Team.find({ leads: actor._id })
      .select('_id')
      .lean();
    const explicitlyLedTeamIds = explicitlyLedTeams.map((team) => team._id);

    if (!canCreateUsers(actor, explicitlyLedTeamIds)) {
      return res.status(403).send('Unauthorized to create users.');
    }

    const desiredRole = String(req.body.role || '').toLowerCase();
    const supportedRoles = ['viewer', 'monitor', 'admin', 'team_lead'];
    if (!supportedRoles.includes(desiredRole)) {
      return res.status(400).send('Please provide a valid user role.');
    }

    if (!canCreateUserRole(actor, desiredRole)) {
      return res
        .status(403)
        .send('Team leads can only create viewer or monitor users.');
    }

    if (!canAssignCreatedUserToTeams(
      actor,
      requestedTeamIds,
      explicitlyLedTeamIds
    )) {
      if (requestedTeamIds.length === 0) {
        return res
          .status(400)
          .send('Scoped team leads must assign the user to a team they lead.');
      }
      return res
        .status(403)
        .send('Scoped team leads can only create users for teams they lead.');
    }

    if (requestedTeamIds.length > 0) {
      const requestedTeams = await Team.find({
        _id: { $in: requestedTeamIds },
      }).select('_id active').lean();
      if (requestedTeams.length !== requestedTeamIds.length) {
        return res.status(400).send('One or more teams were not found.');
      }
      if (requestedTeams.some((team) => team.active === false)) {
        return res.status(400).send('New users cannot be assigned to inactive teams.');
      }
    }

    const payload = {
      username: req.body.username,
      displayName: req.body.displayName,
      email: req.body.email,
      role: desiredRole,
      teams: requestedTeamIds,
      teamMemberships: requestedTeamIds.map((teamId) => ({
        team: teamId,
        role: normalizeTeamRole(desiredRole),
      })),
      createdBy: actor._id,
    };

    User.register(payload, req.body.password, (err, user) => {
      if (err) {
        return res
          .status(err.status || 400)
          .send(err.message || 'Unable to create user.');
      }

      return res.status(200).send(user);
    });
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to create user.');
  }
  /*
  User.register(req.body, function(err, user) {
    err = Error.decode(err);
    if (err) res.status(err.status).send(err.message);
    else {
      // Send password reset email
      sendEmail(user, req, (err) => {
        if (err) res.send(502, err.message); // send status code "Bad Gateway" to indicate email failure
        else res.status(200).send(user);
      });
    }
  });*/
};

// Update a user's team memberships
exports.user_update_teams = async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  if (!Array.isArray(req.body.teams)) {
    return res.status(400).send('Please provide teams as an array.');
  }

  const requestedTeamIds = normalizeIds(req.body.teams);

  if (requestedTeamIds.some((id) => !isValidObjectId(id))) {
    return res.status(400).send('One or more team ids are invalid.');
  }

  try {
    const actor = await User.findById(req.user._id)
      .select('role teams')
      .lean();

    const targetUser = await User.findById(req.params._id)
      .select('-password')
      .lean();

    if (!actor) return res.status(401).send('Unauthenticated.');
    if (!targetUser) return res.sendStatus(404);

    const teams = await Team.find({ _id: { $in: requestedTeamIds } })
      .select('_id active')
      .lean();

    if (teams.length !== requestedTeamIds.length) {
      return res.status(400).send('One or more teams were not found.');
    }

    const currentTeamIds = new Set(normalizeIds(targetUser.teams));
    const newlyAddedInactiveTeam = teams.some(
      (team) => team.active === false && !currentTeamIds.has(String(team._id))
    );
    if (newlyAddedInactiveTeam) {
      return res.status(400).send('Users cannot be added to inactive teams.');
    }

    const isAdmin = actor.role === 'admin';
    const isTeamLead = actor.role === 'team_lead';
    const isSelf = String(actor._id) === String(targetUser._id);

    if (!isAdmin && !isTeamLead) {
      return res.status(403).send('Unauthorized to update user teams.');
    }

    if (!isAdmin && isSelf) {
      return res.status(403).send('Users cannot update their own team memberships.');
    }

    let updatedTeamIds = requestedTeamIds;

    if (isTeamLead) {
      if (!['viewer', 'monitor'].includes(targetUser.role)) {
        return res.status(403).send('Team leads can only manage viewer or monitor team memberships.');
      }

      const actorTeamIds = new Set(normalizeIds(actor.teams));
      const requestedOutsideScope = requestedTeamIds.some((id) => !actorTeamIds.has(id));

      if (requestedOutsideScope) {
        return res.status(403).send('Team leads can only assign users to teams they belong to.');
      }

      const currentTeamIds = normalizeIds(targetUser.teams);
      const preservedTeamIds = currentTeamIds.filter((id) => !actorTeamIds.has(id));

      updatedTeamIds = normalizeIds([...preservedTeamIds, ...requestedTeamIds]);
    }

    const existingMembershipRoles = new Map(
      (targetUser.teamMemberships || []).map((membership) => [
        String(membership.team && (membership.team._id || membership.team)),
        normalizeTeamRole(membership.role),
      ])
    );
    const updatedMemberships = updatedTeamIds.map((teamId) => ({
      team: teamId,
      role: existingMembershipRoles.get(String(teamId)) ||
        normalizeTeamRole(targetUser.role),
    }));
    const removedTeamIds = normalizeIds(targetUser.teams)
      .filter((teamId) => !updatedTeamIds.includes(teamId));

    const updatedUser = await User.findByIdAndUpdate(
      req.params._id,
      {
        teams: updatedTeamIds,
        teamMemberships: updatedMemberships,
      },
      { new: true }
    )
      .select('-password')
      .populate([teamPopulate, teamMembershipPopulate])
      .lean();

    if (removedTeamIds.length > 0) {
      await Team.updateMany(
        { _id: { $in: removedTeamIds } },
        { $pull: { leads: targetUser._id } }
      );
    }

    return res.status(200).send(normalizeUserTeams(updatedUser));
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'User team update failed');
  }
};


// Update a User
exports.user_update = (req, res) => {
  const isAdmin = req.user.role === "admin";
  const isSelf = String(req.params._id) === String(req.user._id);

  if (!isAdmin && !isSelf) return res.sendStatus(403);

  const allowedFields =  // admin can edit roles only when editing others' roles
      isAdmin && !isSelf
      ? ['email', 'username', 'displayName', 'role']
      : ['email', 'username', 'displayName'];


  User.findById(req.params._id, (err, user) => {
    if (err) return res.status(err.status).send(err.message);
    if (!user) return res.sendStatus(404);

    for (const attr of allowedFields) {
      if (req.body[attr] !== undefined) {
        user[attr] = req.body[attr];
      }
    }

    // Display preferences are self-service (both self and admin) and nested,
    // so they're whitelisted explicitly rather than via the flat allowedFields.
    if (req.body.preferences && typeof req.body.preferences === 'object') {
      if (!user.preferences) user.preferences = {};
      const { timeFormat, dateFormat, timeZone } = req.body.preferences;
      if (timeFormat) user.preferences.timeFormat = timeFormat;
      if (dateFormat) user.preferences.dateFormat = dateFormat;
      if (timeZone) user.preferences.timeZone = timeZone;
    }

    user.save((err) => {
      err = Error.decode(err);
      if (err) res.status(err.status).send(err.message);
      else res.status(200).send(user);
    });
  });
};

// Update a User Password
exports.user_update_password = (req, res) => {
  User.findById(req.params._id, (err, user) => {
    if (err) return res.status(err.status).send(err.message);
    if (!user) return res.sendStatus(404);

    // Only admin can update users other than itself
    // (im not sure if this logic works)
    if (
      req.user &&
      !User.can('admin users') &&
      req.params._id != req.user._id
    )
      return res.send(403);
    user.setPassword(req.body.password, (err, user) => {
      if (err) res.status(err.status).send(err.message);
      else
        user.save(user, (err, user) => {
          if (err) res.status(err.status).send(err.message);
          else res.sendStatus(200)
        })
    })

  });
};

// Delete a User
exports.user_delete = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  User.findById(req.params._id, (err, user) => {
    if (err) return res.status(err.status).send(err.message);
    if (!user) return res.sendStatus(404);

    if (req.user.role === 'team_lead') {
      const canDelete = String(user.createdBy) === String(req.user._id);
      if (!canDelete) return res.status(403).send('Unauthorized to delete users you did not create.');
      if (user.role === 'admin') {
        return res.status(403).send('Unauthorized to delete admin users.');
      }
    }

    user.remove((err) => {
      err = Error.decode(err);
      if (err) res.status(err.status).send(err.message);
      else res.sendStatus(200);
    });
  });
};

// Use passport.authenticate() as route middleware to authenticate the request
exports.user_login = (req, res) => {
  User.authenticate('local', (err, user, info) => {
    if (err) res.status(err.status).send(err.message);
    if (!user) res.sendStatus(403);
    res.sendStatus(200);
  });
};
// Log the user out
exports.user_logout = (req, res, next) => {
  req.logout();
};

// Return the currently logged-in user object
exports.user_session = (req, res) => { };
