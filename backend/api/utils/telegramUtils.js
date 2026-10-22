'use strict';

const crypto = require('crypto');
const TelegramAuthSession = require('../../models/telegeramAuthSession');


// Telegram User API (GramJS) helpers for first time login and auth
function makeAuthRequestId() {
  return crypto.randomUUID();
}

function makeExpiresAt(minutes = 20) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function createTelegramAuthSession({ userId, apiId, apiHash, phone, phoneCodeHash, sessionString }) {
  const authRequestId = makeAuthRequestId();
  const doc = await TelegramAuthSession.create({
    user: userId || undefined,
    authRequestId,
    apiId: Number(apiId),
    apiHash,
    phone,
    phoneCodeHash,
    sessionString,
    status: 'CODE_SENT',
    expiresAt: makeExpiresAt(20),
  });
  return doc;
}

async function getTelegramAuthSessionOrThrow(authRequestId) {
  const doc = await TelegramAuthSession.findOne({ authRequestId }).exec();
  if (!doc) {
    const err = new Error('auth_session_not_found_or_expired');
    err.code = 'auth_session_not_found_or_expired';
    throw err;
  }
  return doc;
}

async function updateTelegramAuthSession(authRequestId, status, patch = {}) {
  const doc = await TelegramAuthSession.findOneAndUpdate(
    { authRequestId },
    { $set: { status, ...patch, updatedAt: new Date() } },
    { new: true }
  ).exec();

  if (!doc) {
    const err = new Error('auth_session_not_found_or_expired');
    err.code = 'auth_session_not_found_or_expired';
    throw err;
  }
  return doc;
}

async function deleteTelegramAuthSession(authRequestId) {
  await TelegramAuthSession.deleteOne({ authRequestId }).exec();
}

module.exports = {
  createTelegramAuthSession,
  getTelegramAuthSessionOrThrow,
  updateTelegramAuthSession,
  deleteTelegramAuthSession,
};