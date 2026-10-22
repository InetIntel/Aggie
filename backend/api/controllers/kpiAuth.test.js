const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real authentication handlers without a database or crypto service.
// Authentication verification is stubbed; the assertions concern when KPIs fire.
function fixture() {
  const events = [];
  const user = { _id: 'account-1', username: 'monitor', role: 'monitor',
    webauthnCredentials: [], mfa: {}, save: async () => {} };
  const query = { select() { return this; }, exec: async () => user,
    then(resolve, reject) { return Promise.resolve(user).then(resolve, reject); } };
  let verified = true;
  const dependencies = {
    '../../models/user': { findById: () => query, findOne: () => query },
    '../utils/kpiTracking': { recordLogin: async (value) => events.push(value._id) },
    jsonwebtoken: { sign: () => 'test-token' },
    dotenv: { config() {} },
    'rate-limiter-flexible': { RateLimiterMemory: class { async consume() {} } },
    otpauth: {
      TOTP: class { validate({ token }) { return token === '123456' ? 0 : null; } },
      Secret: { fromBase32: () => ({}) },
    },
    '../../fetching/utils/decryption': { decryptToken: () => 'secret' },
    '@simplewebauthn/server': {
      generateAuthenticationOptions: async () => ({ challenge: 'challenge' }),
      verifyAuthenticationResponse: async () => ({ verified, authenticationInfo: { newCounter: 1 } }),
    },
  };
  const handlers = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./authController'), 'utf8'), {
    exports: handlers, Buffer, URL, console,
    process: { env: {} },
    require: (name) => name === 'crypto' ? require('crypto') : dependencies[name] || {},
  });
  const response = () => ({ statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, cookie() {}, set() {},
  });
  return { handlers, user, events, response, failVerification: () => { verified = false; } };
}

test('password login counts once; pending MFA and failed TOTP do not count', async () => {
  const { handlers, user, events, response } = fixture();
  await handlers.login({ user }, response());
  assert.equal(events.length, 1);
  user.mfaEnforced = true;
  user.mfa.totp = { enabled: true, secretEnc: 'encrypted' };
  const pending = response();
  await handlers.login({ user }, pending);
  assert.equal(pending.body.mfa_required, true);
  assert.equal(events.length, 1);
  const failed = response();
  await handlers.totpLoginVerify({ body: { pendingLoginId: pending.body.pendingLoginId, code: 'wrong' } }, failed);
  assert.equal(failed.statusCode, 400);
  assert.equal(events.length, 1);
  const next = response();
  await handlers.login({ user }, next);
  const complete = response();
  await handlers.totpLoginVerify({ body: { pendingLoginId: next.body.pendingLoginId, code: '123456' } }, complete);
  assert.equal(complete.body.ok, true);
  assert.equal(events.length, 2);
});

test('only verified WebAuthn logins count; a consumed challenge cannot count again', async () => {
  const { handlers, user, events, response, failVerification } = fixture();
  user.webauthnCredentials = [{ credentialID: Buffer.from('credential'), publicKey: Buffer.from('key'), counter: 0 }];
  const req = { body: { username: user.username, rawId: Buffer.from('credential').toString('base64url') } };
  await handlers.webauthnLoginStart(req, response());
  const complete = response();
  await handlers.webauthnLoginFinish(req, complete);
  assert.equal(complete.body.ok, true);
  assert.equal(events.length, 1);
  await handlers.webauthnLoginFinish(req, response());
  assert.equal(events.length, 1);
  await handlers.webauthnLoginStart(req, response());
  failVerification();
  const failed = response();
  await handlers.webauthnLoginFinish(req, failed);
  assert.equal(failed.statusCode, 400);
  assert.equal(events.length, 1);
});
