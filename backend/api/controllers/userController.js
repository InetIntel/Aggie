// Handles CRUD requests for users.
var User = require('../../models/user');
const passport = require('passport');
const validator = require('validator');



exports.user_users = (req, res) => {
  User.find({}, function (err, users) {
    if (err) {

      return res.status(err.status).send(err.message);
    }
    else {
      return res.status(200).send(users);
    }
  });
};

// Get a User by id
exports.user_detail = (req, res) => {
  User.findById(req.params._id, '-password', function (err, user) {
    if (err) { return res.status(err.status).send(err.message); }
    else if (!user) { return res.sendStatus(404); }
    else { return res.status(200).send(user); }
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

  if (!validator.isEmail(req.body.email)) {
    res.status(400).send('Please provide a valid email.');
  } else {
    User.register(
      {
        username: req.body.username,
        displayName: req.body.displayName,
        email: req.body.email,
        role: req.body.role,
      },
      req.body.password,
      (err, user) => {
        if (err) {
          res.status(err.status).send(err.message);
        } else {
          const authenticate = User.authenticate();
          authenticate(req.body.username, req.body.password, (err, result) => {
            if (err) res.status(err.status).send(error.message);
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
  User.findById(req.params._id, (err, user) => {
    if (err) return res.status(err.status).send(err.message);
    if (!user) return res.sendStatus(404);
    // Only admin can update users other than itself
    if (
      req.user &&
      !User.can('admin users') &&
      req.params._id != req.user._id
    )
      return res.send(403);

    for (var attr in req.body) {
      user[attr] = req.body[attr];
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
  User.findById(req.params._id, (err, user) => {
    if (err) return res.status(err.status).send(err.message);
    if (!user) return res.sendStatus(404);
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
