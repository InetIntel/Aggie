const User = require("../../models/user");
const jwt = require('jsonwebtoken');
require('dotenv').config();
const crypto = require('crypto');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');


const challengeStore = new Map();    
const pendingLoginStore = new Map(); 


const now = () => Date.now();
const TTL_MS = 2 * 60 * 1000; // 2 minutes
function putChallenge(key, challenge) {
  challengeStore.set(key, { challenge, expiresAt: now() + TTL_MS });
}
function popChallenge(key) {
  const entry = challengeStore.get(key);
  challengeStore.delete(key);
  if (!entry || entry.expiresAt < now()) return null;
  return entry.challenge;
}
function putPendingLogin(userId) {
  const id = crypto.randomUUID();
  pendingLoginStore.set(id, { userId, expiresAt: now() + TTL_MS });
  return id;
}
function popPendingLogin(id) {
  const entry = pendingLoginStore.get(id);
  pendingLoginStore.delete(id);
  if (!entry || entry.expiresAt < now()) return null;
  return entry.userId;
}


function base64urlToBuffer(b64url) { return Buffer.from(b64url, 'base64url'); }
function bufferToBase64url(buf)    { return Buffer.from(buf).toString('base64url'); }


function toBuf(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (v instanceof ArrayBuffer) return Buffer.from(new Uint8Array(v));
  if (typeof v === 'string') return base64urlToBuffer(v);
  return Buffer.from(v);
}

function effectiveRpID() {
  return (process.env.RP_ID && process.env.RP_ID.trim())
    || (process.env.ORIGIN ? new URL(process.env.ORIGIN).hostname : 'localhost');
}

function cookieOpts() {
  const isProd = process.env.ENVIRONMENT === 'production';
  return {
    httpOnly: true,
    secure: isProd,                  
    sameSite: isProd ? 'lax' : 'lax',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000      
  };
}
function signJWT(user, mfa) {
  const payload = {
    sub: String(user._id),
    username: user.username,
    role: user.role,
    mfa: !!mfa
  };
  // 12 hours
  return jwt.sign(payload, process.env.SECRET, { expiresIn: 60 });
}

const expectedOrigin = process.env.ORIGIN || 'http://localhost:3000';
const rpName = process.env.RP_NAME || 'Aggie';


exports.login = async (req, res) => {
  try {
    // req.user is set by passport local strategy
    const user = await User.findById(req.user._id).select('username role email webauthnCredentials mfaEnforced').exec();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const enrolled = (user.webauthnCredentials || []).length > 0;
    const orgEnforce = String(process.env.MFA_REQUIRE_FOR_ENROLLED || '').toLowerCase() === 'true';
    const mustEnforce = orgEnforce ? enrolled : user.mfaEnforced === true;
   
    if (enrolled && mustEnforce) {
      const pendingLoginId = putPendingLogin(String(user._id));
      return res.status(200).json({
        success: true,
        mfa_required: true,
        pendingLoginId
      });
    }

    const token = signJWT(user, false);
    res.cookie('jwt', token, cookieOpts());
    return res.json({ success: true, token, message: "Authentication successful", mfa: false });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Login failed' });
  }  
}

exports.register = (req, res) => {
  User.register(
    new User({ name: req.body.name, username: req.body.username, email: req.body.email }),
    req.body.password,
    function (err, msg) {
      if (err) {
        res.send(err);
      } else {
        res.send({ message: "Successful" });
      }
    }
  );
};

exports.session = async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).send("Not authenticated");

    const user = await User.findById(req.user._id).lean(); 
    if (!user) {
      return res.status(422).send("No user found.");
    }

    const enrolled = Array.isArray(user.webauthnCredentials) && user.webauthnCredentials.length > 0;
    const enforced = user.mfaEnforced === true;
    const mfa = !!(req.userToken && req.userToken.mfa === true);

    const userStripped = {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      hasDefaultPassword: user.hasDefaultPassword,
      provider: user.provider,
      mfa,
      mfa_enrolled: enrolled,
      mfa_enforced: enforced,
    }
    return res.status(200).json(userStripped); 
  } catch (err) {
    console.error('Error:',err);
    return res.status(422).send(err.message);
  }
};

exports.logout = (req, res) => {
  req.logout();
  res.status(200).send("Logged Out")
};

exports.passwordReset = (req, res) => {
  User.findOne({ username: req.body.username }, (err, user) => {
    if (err) {
      res.status(err.status).send(err.message);
    } else {

      const payload = {
        id: user._id,
        username: user.username,
        role: user.role,
      };
      const token = jwt.sign(payload, process.env.SECRET, { expiresIn: '12hr' });
      res.cookie('jwt', token, {
        httpOnly: true,
        expires: new Date(Date.now() + 43200000), // +1 day
        secure: true,
      });
      res.json({
        token: token,
        success: true,
        message: "Authentication successful"
      });
    }
  });
}

exports.webauthnRegisterStart = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.sendStatus(401);

    if (!user.webauthnUserID || !Buffer.isBuffer(user.webauthnUserID)) {
      user.webauthnUserID = crypto.randomBytes(32);
      await user.save();
    }

    const rpIDEff = effectiveRpID();

    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpIDEff,                 
      userID: user.webauthnUserID,   
      userName: user.username,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // force macOS/iCloud Keychain
        residentKey: 'discouraged',          // fine for 2FA
        userVerification: 'required',      
      },
      excludeCredentials: (user.webauthnCredentials || []).map(c => ({
        id: bufferToBase64url(
          Buffer.isBuffer(c.credentialID) ? c.credentialID : Buffer.from(c.credentialID)
        ),
        type: 'public-key',
        transports: Array.isArray(c.transports) ? c.transports : undefined,
      })),
      timeout: 60000,
    });

    putChallenge(String(user._id), options.challenge);
    
    return res.json(options);
  } catch (err) {
    console.error('[webauthnRegisterStart] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not start registration' });
  }
};

exports.webauthnRegisterFinish = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.sendStatus(401);

    const expectedChallenge = popChallenge(String(user._id));
    if (!expectedChallenge) {
      return res.status(400).json({ ok: false, error: 'Challenge expired' });
    }

    const rpIDEff = effectiveRpID();

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: req.body,                 
        expectedChallenge,
        expectedOrigin,                     
        expectedRPID: rpIDEff,
        requireUserVerification: true,
      });
    } catch (e) {
      console.error('[regFinish] verify threw:', e?.name, e?.message);
      return res.status(400).json({ ok: false, error: 'Registration finish failed' });
    }

    const { verified, registrationInfo } = verification;
    if (!verified || !registrationInfo) {
      return res.status(400).json({ ok: false, error: 'Registration verification failed' });
    }

    const credObj = registrationInfo.credential || {};
    const credentialID        = credObj.id        ?? registrationInfo.credentialID;
    const credentialPublicKey = credObj.publicKey ?? registrationInfo.credentialPublicKey;
    const counter             = credObj.counter   ?? registrationInfo.counter ?? 0;
    const transports =
      Array.isArray(credObj.transports) ? credObj.transports :
      Array.isArray(req.body?.response?.transports) ? req.body.response.transports : undefined;

    if (!credentialID || !credentialPublicKey) {
      return res.status(400).json({ ok: false, error: 'Bad attestation: missing credential fields' });
    }

    const credIDBuf = toBuf(credentialID);
    const credPKBuf = toBuf(credentialPublicKey);

    user.webauthnCredentials ||= [];
    const exists = user.webauthnCredentials.some(c => c.credentialID.equals(credIDBuf));
    if (!exists) {
      user.webauthnCredentials.push({
        credentialID: credIDBuf,
        publicKey:    credPKBuf,
        counter:      Number.isFinite(counter) ? counter : 0,
        transports,
        fmt:          registrationInfo.fmt,
        aaguid:       registrationInfo.aaguid,
        userVerified: !!registrationInfo.userVerified,
        lastUsedAt:   null,
        createdAt:    new Date(),
      });
    }

    if (!user.mfaEnrolledAt) user.mfaEnrolledAt = new Date();
    await user.save();

    const token = signJWT(user, true);  
    res.cookie('jwt', token, cookieOpts());
    return res.json({ ok: true, mfa: true });
  } catch (err) {
    console.error('[webauthnRegisterFinish] error:', err);
    return res.status(400).json({ ok: false, error: 'Registration finish failed' });
  }
};

exports.webauthnLoginStart = async (req, res) => {
  try {
    const { pendingLoginId, username } = req.body || {};

    let userId = null;
    if (pendingLoginId) {
      userId = popPendingLogin(pendingLoginId);
      if (!userId) return res.status(400).json({ ok: false, error: 'Pending login expired' });
    } else if (username) {
      const u = await User.findOne({ username }).select('_id');
      if (!u) return res.status(404).json({ ok: false, error: 'User not found' });
      userId = String(u._id);
    } else {
      return res.status(400).json({ ok: false, error: 'pendingLoginId or username required' });
    }

    const user = await User.findById(userId).select('webauthnCredentials username');
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const creds = Array.isArray(user.webauthnCredentials) ? user.webauthnCredentials : [];
    if (creds.length === 0) {
      return res.status(400).json({ ok: false, error: 'No WebAuthn credentials enrolled' });
    }

    // Build allowCredentials (browser wants base64url string IDs)
    const allowIdsB64 = creds.map(c => bufferToBase64url(
      Buffer.isBuffer(c.credentialID) ? c.credentialID : Buffer.from(c.credentialID)
    ));
    // Dedupe in case of accidental duplicates
    const seen = new Set();
    const allowCredentials = allowIdsB64
      .filter(id => (seen.has(id) ? false : (seen.add(id), true)))
      .map((id, i) => ({
        id,
        type: 'public-key',
        transports: Array.isArray(creds[i]?.transports) ? creds[i].transports : undefined,
      }));

    const rpID = effectiveRpID();
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60000,
      userVerification: 'required',
      allowCredentials, 
    });

    putChallenge(String(user._id), options.challenge);

    return res.json(options);
  } catch {
    return res.status(400).json({ ok: false, error: 'Could not start authentication' });
  }
};

exports.webauthnLoginFinish = async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ ok: false, error: 'username required' });

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const expectedChallenge = popChallenge(String(user._id));
    if (!expectedChallenge) return res.status(400).json({ ok: false, error: 'Challenge expired' });

    const reqIdB64 = req.body?.rawId || req.body?.id;
    if (!reqIdB64) return res.status(400).json({ ok:false, error:'Missing credential id' });

    // Lookup stored credential 
    const dbCreds = Array.isArray(user.webauthnCredentials) ? user.webauthnCredentials : [];
    const byId = new Map(dbCreds.map(c => [bufferToBase64url(
      Buffer.isBuffer(c.credentialID) ? c.credentialID : Buffer.from(c.credentialID)
    ), c]));
    const cred = byId.get(reqIdB64);
    if (!cred) return res.status(400).json({ ok:false, error:'Unknown credential' });

    const credential = {
      id:        toBuf(cred.credentialID),            
      publicKey: toBuf(cred.publicKey),               
      counter:   Number.isFinite(cred.counter) ? cred.counter : 0,
      transports: Array.isArray(cred.transports) ? cred.transports : undefined,
    };
    
    const rpID = effectiveRpID();
    
    if (bufferToBase64url(credential.id) !== reqIdB64) {
      return res.status(400).json({ ok:false, error:'Credential ID mismatch' });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: req.body,           
        expectedChallenge,
        expectedOrigin,                
        expectedRPID: rpID,
        credential,
        requireUserVerification: true,                    
      });
    } catch (e) {
      console.error('[loginFinish] verify threw:', e?.name, e?.message);
      return res.status(400).json({ ok:false, error:'Authentication verification threw' });
    }

    const { verified, authenticationInfo } = verification;
    if (!verified || !authenticationInfo) {
      return res.status(400).json({ ok: false, error: 'Authentication verification failed' });
    }


    // Update counter & metadata
    const usedId = authenticationInfo.credentialID
      ? bufferToBase64url(authenticationInfo.credentialID)
      : reqIdB64;

    const match = dbCreds.find(c => bufferToBase64url(
      Buffer.isBuffer(c.credentialID) ? c.credentialID : Buffer.from(c.credentialID)
    ) === usedId);

    if (match) {
      match.counter      = authenticationInfo.newCounter ?? authenticationInfo.counter ?? match.counter;
      match.userVerified = authenticationInfo.userVerified === true;
      match.lastUsedAt   = new Date();
      await user.save();
    }

    const token = signJWT(user, true);
    res.cookie('jwt', token, cookieOpts());
    return res.json({ ok: true, mfa: true, token });
  } catch {
    return res.status(400).json({ ok: false, error: 'Authentication finish failed' });
  }
};
