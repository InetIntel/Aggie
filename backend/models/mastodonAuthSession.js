'use strict';

const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;

const mastodonAuthSessionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
  authRequestId: { type: String, required: true, unique: true, index: true },
  state: { type: String, required: true, unique: true, index: true },
  serverUrl: { type: String, required: true },
  clientId: { type: String, required: true },
  clientSecret: { type: String, required: true },
  redirectUri: { type: String, required: true },
  scopes: { type: String, required: true, default: 'read read:accounts' },
  status: {
    type: String,
    enum: ['APP_CREATED', 'AUTHORIZED'],
    default: 'APP_CREATED',
    index: true,
  },
  accessToken: { type: String, required: false },
  account: {
    id: { type: String, required: false },
    username: { type: String, required: false },
    acct: { type: String, required: false },
    url: { type: String, required: false },
    displayName: { type: String, required: false },
  },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

mastodonAuthSessionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

mastodonAuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const MastodonAuthSession = mongoose.model('MastodonAuthSession', mastodonAuthSessionSchema);

module.exports = MastodonAuthSession;
