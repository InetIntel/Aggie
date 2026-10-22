'use strict';

const crypto = require('crypto');
const MastodonAuthSession = require('../../models/mastodonAuthSession');

function normalizeMastodonServerUrl(serverUrl) {
  const rawValue = String(serverUrl || '').trim();
  if (!rawValue) {
    throw new Error('mastodon_server_url_required');
  }

  const withProtocol = /^https?:\/\//i.test(rawValue)
    ? rawValue
    : `https://${rawValue}`;

  const parsed = new URL(withProtocol);
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';

  return parsed.toString().replace(/\/$/, '');
}

function makeId() {
  return crypto.randomUUID();
}

function makeExpiresAt(minutes = 20) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function createMastodonAuthSession({
  userId,
  serverUrl,
  clientId,
  clientSecret,
  redirectUri,
  scopes,
}) {
  return MastodonAuthSession.create({
    user: userId || undefined,
    authRequestId: makeId(),
    state: makeId(),
    serverUrl,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    status: 'APP_CREATED',
    expiresAt: makeExpiresAt(20),
  });
}

async function getMastodonAuthSessionOrThrow(authRequestId) {
  const doc = await MastodonAuthSession.findOne({ authRequestId }).exec();
  if (!doc) {
    const err = new Error('mastodon_auth_session_not_found_or_expired');
    err.code = 'mastodon_auth_session_not_found_or_expired';
    throw err;
  }
  return doc;
}

async function getMastodonAuthSessionByStateOrThrow(state) {
  const doc = await MastodonAuthSession.findOne({ state }).exec();
  if (!doc) {
    const err = new Error('mastodon_auth_session_not_found_or_expired');
    err.code = 'mastodon_auth_session_not_found_or_expired';
    throw err;
  }
  return doc;
}

async function updateMastodonAuthSession(authRequestId, status, patch = {}) {
  const doc = await MastodonAuthSession.findOneAndUpdate(
    { authRequestId },
    { $set: { status, ...patch, updatedAt: new Date() } },
    { new: true }
  ).exec();

  if (!doc) {
    const err = new Error('mastodon_auth_session_not_found_or_expired');
    err.code = 'mastodon_auth_session_not_found_or_expired';
    throw err;
  }

  return doc;
}

async function deleteMastodonAuthSession(authRequestId) {
  await MastodonAuthSession.deleteOne({ authRequestId }).exec();
}

function buildMastodonAuthorizeUrl({ serverUrl, clientId, redirectUri, scopes, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });

  return `${serverUrl}/oauth/authorize?${params.toString()}`;
}

module.exports = {
  buildMastodonAuthorizeUrl,
  createMastodonAuthSession,
  deleteMastodonAuthSession,
  getMastodonAuthSessionByStateOrThrow,
  getMastodonAuthSessionOrThrow,
  normalizeMastodonServerUrl,
  updateMastodonAuthSession,
};
