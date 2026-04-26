// Handles CRUD requests for credentials
'use strict';

const Credentials = require('../../models/credentials');
const Source = require('../../models/source');
const { encryptSecrectsObject } = require('../utils/encryption');
const axios = require('axios');

const { TelegramClient } = require('telegram');
const { Logger } = require('telegram/extensions');
const { computeCheck } = require('telegram/Password');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');

const {
  createTelegramAuthSession,
  getTelegramAuthSessionOrThrow,
  updateTelegramAuthSession,
  deleteTelegramAuthSession,
} = require('../utils/telegramUtils');
const {
  buildMastodonAuthorizeUrl,
  createMastodonAuthSession,
  deleteMastodonAuthSession,
  getMastodonAuthSessionByStateOrThrow,
  getMastodonAuthSessionOrThrow,
  normalizeMastodonServerUrl,
  updateMastodonAuthSession,
} = require('../utils/mastodonUtils');

  // Create new credentials
  /**
   * body: if it's for telegram user api, send body with "authRequestId" instead of "secrets"
   * 
   */
exports.credential_create = async (req, res) => {
  try {
      const data = { ...req.body };
      if (data.type === 'telegramUser') {
        const { authRequestId } = data;

        if (!authRequestId) {
          return res.status(400).send('Missing required field');
        }

        const authSession = await getTelegramAuthSessionOrThrow(authRequestId);

        if (authSession.status !== 'AUTHORIZED') {
          return res.status(400).send('telegram_not_authorized');
        }

        data.secrets = {
          apiId: String(authSession.apiId),     
          apiHash: authSession.apiHash,
          sessionString: authSession.sessionString,
        };

        delete data.authRequestId;

        const encryptedData = { ...data };
        encryptedData.secrets = encryptSecrectsObject(encryptedData.secrets);
  
        const credentials = await Credentials.create(encryptedData);
  
        await deleteTelegramAuthSession(authRequestId);
        credentials.stripSecrets();
        return res.status(200).send(credentials);

      }
      if (data.type === 'mastodon') {
        const { authRequestId } = data;

        if (!authRequestId) {
          return res.status(400).send('Missing required field');
        }

        const authSession = await getMastodonAuthSessionOrThrow(authRequestId);

        if (authSession.status !== 'AUTHORIZED' || !authSession.accessToken) {
          return res.status(400).send('mastodon_not_authorized');
        }

        data.secrets = {
          serverUrl: authSession.serverUrl,
          clientId: authSession.clientId,
          clientSecret: authSession.clientSecret,
          accessToken: authSession.accessToken,
          accountId: authSession.account?.id || '',
          accountUsername: authSession.account?.username || '',
          accountAcct: authSession.account?.acct || '',
          accountUrl: authSession.account?.url || '',
        };

        delete data.authRequestId;

        const encryptedData = { ...data };
        encryptedData.secrets = encryptSecrectsObject(encryptedData.secrets);

        const credentials = await Credentials.create(encryptedData);

        await deleteMastodonAuthSession(authRequestId);
        credentials.stripSecrets();
        return res.status(200).send(credentials);
      }
      if (data.secrets && typeof data.secrets === 'object') {
          data.secrets = encryptSecrectsObject(data.secrets);
      }
     
      const credentials = await Credentials.create(data);
      credentials.stripSecrets();
      res.status(200).send(credentials);
  } catch (err) {
      res.status(err.status).send(err.message);
  }
}

  // Delete credentials by their ID
exports.credential_delete = async (req, res) => {
  const { _id } = req.params;
  try {
    // return 409 Conflict if Sources using these credentials are still left
    const sources = await Source.find({ credentials: _id }).exec();
    if (sources.length > 0) {
      res.sendStatus(409);
      return;
    }
    const { deletedCount } = await Credentials.deleteOne({ _id });
    if (deletedCount === 0) return res.sendStatus(404);
    res.sendStatus(200);
  } catch (err) {
    res.status(err.status).send(err.message);
  }
}

  // Get all of the (stripped) credentials
exports.credential_credentials = async (req, res) => {
  try {
      const credentials = await Credentials.find({}).exec();
      credentials.forEach((c) => c.stripSecrets());
      res.status(200).send(credentials);
  } catch (err) {
      res.status(err.status).send(err.message);
  }
}

// Get a set of (stripped) credentials by its ID
exports.credential_details = async (req, res) => {
  const { _id } = req.params;
  try {
      const credentials = await Credentials.findById(_id).exec();
      if (!credentials) {
        res.sendStatus(404);
        return;
      }
      credentials.stripSecrets();
      res.status(200).send(credentials);
  } catch (err) {
      res.status(err.status).send(err.message);
  }
}

// Telegram User API Credential Creation Workflows - authStart, verifyCode, verifyPassword

async function makeClient({ apiId, apiHash, sessionString = '' }) {
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, Number(apiId), apiHash, {
    baseLogger: new Logger('none'),
    connectionRetries: 5,
  });
  await client.connect();
  return { client, session };
}


/**
 * Start a telegram temporary auth session
 * body: apiId, apiHash, phone
 * 
 */
exports.telegramUserAuthStart = async (req, res, next) => {
  try {
    const { apiId, apiHash, phone } = req.body || {};
    if (!apiId || !apiHash || !phone) {
      return res.status(400).json({ error: 'Missing_required_fields', fields: ['apiId', 'apiHash', 'phone'] });
    }

    const { client, session } = await makeClient({ apiId, apiHash });

    try {
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone,
          apiId: Number(apiId),
          apiHash: apiHash,
          settings: new Api.CodeSettings({}),
        })
      );

      const userId = req.user?._id || req.user?.id || null;

      const tempAuthSession = await createTelegramAuthSession({
        userId,
        apiId,
        apiHash,
        phone,
        phoneCodeHash: result.phoneCodeHash,
        sessionString: session.save(),
        ttlMinutes: 5,
      });

      return res.json({ authRequestId: tempAuthSession.authRequestId });
    } finally {
      await client.disconnect().catch(() => {});
    }
  } catch (err) {
    return next(err);
  }
};



/**
 * Verify sign-in with user provided code and authRequestId
 * body: authRequestId, code
 * return: authorization status ("AUTHORIZED" / "PASSWORD_REQUIRED")
 */

exports.telegramUserAuthVerifyCode = async function telegramUserAuthVerifyCode(req, res, next) {
  try {
    const { authRequestId, code } = req.body || {};
    if (!authRequestId || !code) {
      return res.status(400).json({ error: 'missing_required_fields', fields: ['authRequestId', 'code'] });
    }

    const authSession = await getTelegramAuthSessionOrThrow(authRequestId);

    const { client, session } = await makeClient({
      apiId: authSession.apiId,
      apiHash: authSession.apiHash,
      sessionString: authSession.sessionString,
    });

    try {
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: authSession.phone,
            phoneCodeHash: authSession.phoneCodeHash,
            phoneCode: code,
          })
        );

        // Authorized successfully
        await updateTelegramAuthSession(authRequestId, 'AUTHORIZED', {
          sessionString: session.save(), // final session
        });

        return res.json({ status: 'AUTHORIZED' });
      } catch (e) {
        const msg = String(e?.message || e);

        // Telegram requires 2FA password
        if (msg.includes('SESSION_PASSWORD_NEEDED')) {
          await updateTelegramAuthSession(authRequestId, 'PASSWORD_REQUIRED', {
            sessionString: session.save(),
          });
          return res.json({ status: 'PASSWORD_REQUIRED' });
        }

        // common “bad code” errors
        if (msg.includes('PHONE_CODE_INVALID')) {
          return res.status(400).json({ error: 'Invalid_code' });
        }
        if (msg.includes('PHONE_CODE_EXPIRED')) {
          // delete temp session, other sessions rely on ttl deletion
          await deleteTelegramAuthSession(authRequestId).catch(() => {});
          return res.status(400).json({ error: 'Code_expired' });
        }

        throw e;
      }
    } finally {
      await client.disconnect().catch(() => {});
    }
  } catch (err) {
    return next(err);
  }
};



/**
 * Verify sign-in when telegram 2FA password is required
 * body: authRequestId, password
 * return "AUTHORIZED" (or error)
 */

exports.telegramUserAuthVerifyPassword = async function telegramUserAuthVerifyPassword(req, res, next) {
  try {
    const { authRequestId, password } = req.body || {};
    if (!authRequestId || !password) {
      return res.status(400).json({ error: 'missing_required_fields', fields: ['authRequestId', 'password'] });
    }

    const authSession = await getTelegramAuthSessionOrThrow(authRequestId);

    if (authSession.status !== 'PASSWORD_REQUIRED') {
      // If already authorized, return OK; otherwise user is out of order.
      if (authSession.status === 'AUTHORIZED') return res.json({ status: 'AUTHORIZED' });
      return res.status(400).json({ error: 'password_not_expected', status: authSession.status });
    }

    const { client, session } = await makeClient({
      apiId: authSession.apiId,
      apiHash: authSession.apiHash,
      sessionString: authSession.sessionString,
    });

    try {
      const pwd = await client.invoke(new Api.account.GetPassword());
      const passwordCheck = await computeCheck(pwd, password);

      await client.invoke(
        new Api.auth.CheckPassword({
          password: passwordCheck,
        })
      );

      await updateTelegramAuthSession(authRequestId, 'AUTHORIZED', {
        sessionString: session.save(), // final session
      });

      return res.json({ status: 'AUTHORIZED' });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('PASSWORD_HASH_INVALID')) {
        return res.status(400).json({ error: 'invalid_password' });
      }
      throw e;
    } finally {
      await client.disconnect().catch(() => {});
    }
  } catch (err) {
    return next(err);
  }
};

function getMastodonRedirectUri(req) {
  return `${getPublicAppBaseUrl(req)}/api/credential/mastodon/auth/callback`;
}

function getPublicAppBaseUrl(req) {
  const origin = process.env.ORIGIN || `${req.protocol}://${req.get('host')}`;
  const basePath = process.env.APP_BASE_PATH || req.get('x-forwarded-prefix') || '';
  return `${origin}${normalizeBasePath(basePath)}`.replace(/\/$/, '');
}

function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') {
    return '';
  }

  return `/${basePath.replace(/^\/+|\/+$/g, '')}`;
}

exports.mastodonAuthStart = async (req, res, next) => {
  try {
    const { serverUrl } = req.body || {};
    if (!serverUrl) {
      return res.status(400).json({ error: 'missing_required_fields', fields: ['serverUrl'] });
    }

    const normalizedServerUrl = normalizeMastodonServerUrl(serverUrl);
    const redirectUri = getMastodonRedirectUri(req);
    const scopes = 'read read:accounts read:statuses read:search';

    const formData = new URLSearchParams({
      client_name: 'Aggie',
      redirect_uris: redirectUri,
      scopes,
      website: getPublicAppBaseUrl(req),
    });

    const appResponse = await axios.post(
      `${normalizedServerUrl}/api/v1/apps`,
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const userId = req.user?._id || req.user?.id || null;
    const authSession = await createMastodonAuthSession({
      userId,
      serverUrl: normalizedServerUrl,
      clientId: appResponse.data.client_id,
      clientSecret: appResponse.data.client_secret,
      redirectUri,
      scopes,
    });

    const authUrl = buildMastodonAuthorizeUrl({
      serverUrl: normalizedServerUrl,
      clientId: authSession.clientId,
      redirectUri,
      scopes,
      state: authSession.state,
    });

    return res.json({
      authRequestId: authSession.authRequestId,
      authUrl,
    });
  } catch (err) {
    return next(err);
  }
};

exports.mastodonAuthCallback = async (req, res, next) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query || {};

    if (error) {
      return res.status(400).send(errorDescription || String(error));
    }

    if (!code || !state) {
      return res.status(400).send('Missing required Mastodon callback query parameters.');
    }

    const authSession = await getMastodonAuthSessionByStateOrThrow(String(state));

    const tokenPayload = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      client_id: authSession.clientId,
      client_secret: authSession.clientSecret,
      redirect_uri: authSession.redirectUri,
      scope: authSession.scopes,
    });

    const tokenResponse = await axios.post(
      `${authSession.serverUrl}/oauth/token`,
      tokenPayload.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const accountResponse = await axios.get(
      `${authSession.serverUrl}/api/v1/accounts/verify_credentials`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const account = accountResponse.data || {};

    await updateMastodonAuthSession(authSession.authRequestId, 'AUTHORIZED', {
      accessToken,
      account: {
        id: account.id || '',
        username: account.username || '',
        acct: account.acct || '',
        url: account.url || '',
        displayName: account.display_name || '',
      },
    });

    return res.status(200).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Mastodon Authorization Complete</title>
          <style>
            body { font-family: sans-serif; margin: 2rem; color: #0f172a; }
            .card { max-width: 32rem; border: 1px solid #cbd5e1; border-radius: 0.75rem; padding: 1rem 1.25rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Mastodon authorization complete</h1>
            <p>You can return to Aggie and finish saving this credential.</p>
            <p>This window can be closed.</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage(
                  {
                    type: 'aggie-mastodon-auth-complete',
                    authRequestId: ${JSON.stringify(authSession.authRequestId)}
                  },
                  '*'
                );
              }
            } catch (e) {}
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    return next(err);
  }
};

exports.mastodonAuthStatus = async (req, res, next) => {
  try {
    const authSession = await getMastodonAuthSessionOrThrow(req.params.authRequestId);

    return res.status(200).json({
      status: authSession.status,
      authRequestId: authSession.authRequestId,
      account: authSession.account || null,
    });
  } catch (err) {
    return next(err);
  }
};
