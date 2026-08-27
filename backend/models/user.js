// Represents a user of the system.
var database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose');
const {
  PERMISSION_KEYS,
  PERMISSION_ROLES,
  hasPermission,
} = require('../access/permissions');
const { TEAM_PERMISSION_KEYS } = require('../access/teamMemberships');
require('dotenv').config()

function bufferToBase64url(buf) {
  try {
    return Buffer.from(buf).toString('base64url');
  } catch {
    return Buffer.from(buf).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  }
}


const WebAuthnCredSchema = new Schema({
  credentialID: { type: Buffer, required: true },   
  publicKey:    { type: Buffer, required: true },   
  counter:      { type: Number,  required: true, default: 0 },
  transports:   [{ type: String }],
  fmt:          { type: String },
  aaguid:       { type: String },
  userVerified: { type: Boolean, default: false },
  lastUsedAt:   { type: Date },
  label:        { type: String, trim:true, maxlength: 50},
  createdAt:    { type: Date, default: Date.now }
}, { _id: false });

const RecoveryCodeSchema = new Schema({
  hash: { type: String, required: true }, 
  usedAt: { type: Date, default: null }
}, { _id: false });

var userSchema = new Schema({
  provider: { type: String, default: 'local' },
  username: { type: String, required: true, unique: true },
  displayName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  hasDefaultPassword: { type: Boolean, default: true },
  role: { type: String, default: 'viewer' },
  permissionOverrides: {
    allow: {
      type: [String],
      enum: PERMISSION_KEYS,
      default: [],
    },
    deny: {
      type: [String],
      enum: PERMISSION_KEYS,
      default: [],
    },
  },
  teams: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
      default: [],
      index: true,
  },
  teamMemberships: {
    type: [{
      _id: false,
      team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
      role: {
        type: String,
        enum: ['viewer', 'monitor', 'team_lead'],
        default: 'viewer',
      },
      permissionOverrides: {
        allow: {
          type: [String],
          enum: TEAM_PERMISSION_KEYS,
          default: [],
        },
        deny: {
          type: [String],
          enum: TEAM_PERMISSION_KEYS,
          default: [],
        },
      },
    }],
    default: [],
  },
  active: { type: Boolean, default: true },
  attempts: { type: Number, default: 0 },
  last: { type: Date },
  webauthnUserID: { type: Buffer }, 
  currentChallenge: { type: String },   
  webauthnCredentials: { type: [WebAuthnCredSchema], default: [] },
  mfaEnforced: { type: Boolean, default: false },  
  mfaEnrolledAt: { type: Date },
  createdBy: {type: Schema.Types.ObjectId, ref: 'User', index: true},
  mfa: {
    totp: {
      enabled: { type: Boolean, default: false },
      secretEnc: { type: String }, //stores { iv, ct, tag } base64 strings, serialized JSON
      verifiedAt: { type: Date },
      lastTimestepUsed: { type: Number }, 
      issuer: { type: String },
      digits: { type: Number, default: 6 },
      period: { type: Number, default: 30 },
      algo: { type: String, default: 'SHA1' },
      recoveryCodes: { type: [RecoveryCodeSchema], default: [] }
    }
  }
});

userSchema.index(
  { _id: 1, 'webauthnCredentials.credentialID': 1 },
  { unique: true, sparse: true }
);
userSchema.index({ 'webauthnCredentials.credentialID': 1 });
userSchema.index({ 'teamMemberships.team': 1 });

userSchema.set('toJSON', {
  transform: function (doc, ret) {
    
    delete ret.password;
    delete ret.currentChallenge;

    if (Array.isArray(ret.webauthnCredentials)) {
      ret.webauthnCredentials = ret.webauthnCredentials.map(c => {
        const out = { ...c };
        // hider raw buffer
        if (out.credentialID) out.credentialID = bufferToBase64url(out.credentialID);
        delete out.publicKey;
        return out;
      });
    }

    if (ret.mfa && ret.mfa.totp) {
      const t = ret.mfa.totp;
      ret.mfa.totp = {
        enabled: !!t.enabled,
        issuer: t.issuer || undefined,
        digits: t.digits,
        period: t.period,
        algo: t.algo
      };
    }
    return ret;
  }
});


userSchema.plugin(passportLocalMongoose, {
  usernameLowerCase: true,
});

var User = mongoose.model('User', userSchema);

// Kept as a public model property for compatibility with existing callers.
User.permissions = PERMISSION_ROLES;
User.hasPermission = hasPermission;

// Determine if a user can do a certain action
User.can = (permission) => {
  return (req, res, next) => {
    const user = req.user;
    if (String(process.env.ADMIN_PARTY).toLowerCase() === 'true') {
      req.accessUser = {
        _id: user && (user._id || user.id),
        role: 'admin',
        teams: [],
      };
      return next();
    }
    if (!user) {
      return res.status(401).send('Authentication required.');
    }
    User.findById(user.id || user._id, (err, foundUser) => {
      if (err) {
        return res.status(422).send('Unable to verify user permissions.');
      }
      if (!foundUser || !foundUser.active) {
        return res.status(401).send('User account is unavailable.');
      }
      if (hasPermission(foundUser, permission)) {
        req.accessUser = foundUser;
        return next();
      }
      return res.status(403).send('You are not authorized to ' + permission + '.');
    });
  };
};

module.exports = User;
