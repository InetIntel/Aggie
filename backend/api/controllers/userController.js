// Handles CRUD requests for users.
var User = require('../../models/user');
const passport = require('passport');
const validator = require('validator');


// get user list
exports.user_users = (req, res) => {
  if (!req.user) return res.status(401).send("Unauthenticated.");

  User.find({})
    .select("-password")
    .lean()
    .exec((err, users) => {
      if (err) {
        return res
          .status(err.status || 500)
          .send(err.message || "User query failed");
      }
      return res.status(200).send(users);
    });
};

// get manageble user list (for admin: all, for team lead: team lead + created users)
exports.user_manageableUsers = (req, res) => {
  if (!req.user) return res.status(401).send("Unauthenticated.");

  const role = req.user.role;
  const self = req.user._id;
  let filter = { _id: req.user._id }
  if (role === "admin") {
    filter = {};
  } else if (role === "team_lead") {
    filter = {
      $or: [
        { _id: self },
        { createdBy: self },
      ],
    };
  } else {
    filter = { _id: self };
  }

  User.find(filter)
    .select("-password")
    .lean()
    .exec((err, users) => {
      if (err) {
        return res
          .status(err.status || 500)
          .send(err.message || "User query failed");
      }
      return res.status(200).send(users);
    });
};

// Get a User by id
exports.user_detail = (req, res) => {
  if (!req.user) return res.status(401).send('Unauthenticated.');

  User.findById(req.params._id, '-password', function (err, user) {
    if (err) { return res.status(err.status).send(err.message); }
    else if (!user) { return res.sendStatus(404); }
    else {
      const role = req.user.role;
      const isSelf = String(user._id) === String(req.user._id);
      let allowed = false;

      if (role === 'admin') {
        allowed = true; 
      } else if (role === 'team_lead') {
        const createdByMe = String(user.createdBy) === String(req.user._id);
        allowed = isSelf || createdByMe; 
      } else {
        allowed = isSelf; 
      }

      if (!allowed) return res.status(403).send('Unauthorized to view the user.');
      return res.status(200).send(user);
    }
  });
};

// Create a new User
exports.user_create = (req, res) => {
  console.log(
    'Attempting to register user with username: ' +
    req.body.username +
    ' and email: ' +
    req.body.email +
    '.'
  );

  if (!req.user) return res.status(401).send('Unauthenticated.');

  if (!validator.isEmail(req.body.email)) {
    res.status(400).send('Please provide a valid email.');
  } else {

    if (req.user.role === 'team_lead') {
      const desiredRole = (req.body.role || '').toLowerCase();
      if (!['viewer', 'monitor'].includes(desiredRole)) {
        return res.status(403).send('Unauthorized.Team lead can only create viewer or monitor users.');
      }
    }

    const payload = {
      username: req.body.username,
      displayName: req.body.displayName,
      email: req.body.email,
      role: req.body.role,
      createdBy: req.user._id,    
    };

    User.register(
      payload,
      req.body.password,
      (err, user) => {
        if (err) {
          res.status(err.status).send(err.message);
        } else {
          const authenticate = User.authenticate();
          authenticate(req.body.username, req.body.password, (err, result) => {
            if (err) res.status(err.status).send(err.message);
            else res.status(200).send(user);
          });
        }
      }
    );
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
