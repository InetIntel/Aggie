'use strict';

// Stores temporary state for Telegram User API (GramJS) login wizard.
// Auto-expires via TTL so abandoned auth sessions are cleaned up.
const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;

const telegramAuthSessionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },

  // unique id your frontend will use
  authRequestId: { type: String, required: true, unique: true, index: true },

  // Telegram app credentials (not super secret, but still treat as secrets)
  apiId: { type: Number, required: true },
  apiHash: { type: String, required: true },

  phone: { type: String, required: true },

  // Returned by Telegram SendCode, needed for SignIn
  phoneCodeHash: { type: String, required: true },

  // GramJS StringSession.save() output (partial or final during the flow)
  sessionString: { type: String, required: true },

  // Flow status
  status: {
    type: String,
    enum: ['CODE_SENT', 'PASSWORD_REQUIRED', 'AUTHORIZED'],
    default: 'CODE_SENT',
    index: true,
  },

  // TTL
  expiresAt: { type: Date, required: true, index: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Keep updatedAt fresh
telegramAuthSessionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// TTL index: Mongo will delete after expiresAt
telegramAuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TelegramAuthSession = mongoose.model('TelegramAuthSession', telegramAuthSessionSchema);

module.exports = TelegramAuthSession;