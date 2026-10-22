// This is used as authentication middleware
const User = require('../models/user');
const passport = require('passport');
const config = require('../config/secrets').get();
require('dotenv').config();
const passportJWT = require("passport-jwt");
const Strategy = passportJWT.Strategy;

const cookieExtractor = function(req) {
  var token = null;
  if (req && req.cookies)
  {
    token = req.cookies['jwt'];
  }
  return token;
};

const params = {
  secretOrKey: process.env.SECRET,
  jwtFromRequest: cookieExtractor
};

module.exports = function() {
  const strategy = new Strategy(params, async function (payload, done) {
    try {
      const userId = payload.sub || payload.id;
      const user = await User.findById(userId).lean(false);
      if (!user) {
        return done(null, false);
      }

      return done(null, user, { tokenPayload: payload });
    } catch (err) {
      console.error('debugging-[jwt] error', err);
      return done(null, false);
    }
  });
  passport.use(strategy);

  function authenticate() {
    // Wrapper to attach token payload to req
    return function (req, res, next) {
      return passport.authenticate('jwt', config.jwtSession, function (err, user, info) {
        if (err || !user) return res.sendStatus(401);
        req.user = user;
        req.userToken = info && info.tokenPayload ? info.tokenPayload : null;
        return next();
      })(req, res, next);
    };
  }

  return {
    initialize: () => passport.initialize(),
    authenticate,
  };
};