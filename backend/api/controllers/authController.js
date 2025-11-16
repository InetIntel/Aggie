const User = require("../../models/user");
const jwt = require('jsonwebtoken');
require('dotenv').config();
const crypto = require('crypto');
const OTPAuth = require('otpauth');                              
const QRCode = require('qrcode');                                
const argon2 = require('argon2');                                 
const { RateLimiterMemory } = require('rate-limiter-flexible');   
const { encryptToken } = require('../utils/encryption');
const { decryptToken } = require('../../fetching/utils/decryption');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');


const challengeStore = new Map();    
const pendingLoginStore = new Map(); 

// Webauth Helpers
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

// TOTP Helpers
const TOTP_DIGITS = Number(process.env.TOTP_DIGITS || 6);               
const TOTP_PERIOD = Number(process.env.TOTP_PERIOD || 30);              
const TOTP_ALGO   = (process.env.TOTP_ALGO || 'SHA1').toUpperCase();    
const TOTP_WINDOW = Number(process.env.TOTP_WINDOW || 1);               
const APP_ISSUER  = process.env.APP_ISSUER || 'Aggie';                  
const BACKUP_CODE_COUNT  = Number(process.env.BACKUP_CODE_COUNT || 10); 
const BACKUP_CODE_LENGTH = Number(process.env.BACKUP_CODE_LENGTH || 10);

function makeOtpAuthUri({ issuer, label, secret, digits, period, algo }) {   
  const totp = new OTPAuth.TOTP({
    issuer,
    label,
    secret: OTPAuth.Secret.fromBase32(secret),
    digits,
    period,
    algorithm: algo
  });
  return totp.toString();
}
function verifyTotpCode({ secret, code, digits, period, algo, window = TOTP_WINDOW }) { 
  const totp = new OTPAuth.TOTP({
    issuer: APP_ISSUER,
    label: '',
    secret: OTPAuth.Secret.fromBase32(secret),
    digits,
    period,
    algorithm: algo
  });
  const delta = totp.validate({ token: String(code || '').trim(), window });
  return (delta !== null);
}
function currentTimestep(period) {                                         
  return Math.floor(Date.now() / 1000 / period);
}
function generateRecoveryCodes() {                                         
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let s = '';
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      s += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    codes.push(s);
  }
  return codes;
}

// NEW: rate limiters (memory) — per pendingLoginId & per user only
const limiterPending = new RateLimiterMemory({ points: 5, duration: 600 });   // 5 per 10m
const limiterUser    = new RateLimiterMemory({ points: 10, duration: 3600 }); // 10 per 1h


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
  return jwt.sign(payload, process.env.SECRET, { expiresIn: '12h' });
}

const expectedOrigin = process.env.ORIGIN || 'http://localhost:3000';
const rpName = process.env.RP_NAME || 'Aggie';


exports.login = async (req, res) => {
  try {
    // req.user is set by passport local strategy
    const user = await User.findById(req.user._id)
                           .select('username role email webauthnCredentials mfaEnforced mfa')
                           .exec();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const webauthnEnrolled = (user.webauthnCredentials || []).length > 0;
    const totpEnrolled = !!(user.mfa && user.mfa.totp && user.mfa.totp.enabled === true);
    const enrolled = webauthnEnrolled || totpEnrolled;

    const orgEnforce = String(process.env.MFA_REQUIRE_FOR_ENROLLED || '').toLowerCase() === 'true';
    const mustEnforce = orgEnforce ? enrolled : user.mfaEnforced === true;
   
    if (enrolled && mustEnforce) {
      const pendingLoginId = putPendingLogin(String(user._id));
      return res.status(200).json({
        success: true,
        mfa_required: true,
        pendingLoginId,
        methods: [
          ...(webauthnEnrolled ? ['webauthn'] : []),
          ...(totpEnrolled ? ['totp'] : [])
        ]
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

    const webauthnEnrolled = Array.isArray(user.webauthnCredentials) && user.webauthnCredentials.length > 0; 
    const totpEnrolled = !!(user.mfa && user.mfa.totp && user.mfa.totp.enabled === true);
    const enrolled = webauthnEnrolled || totpEnrolled;

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
      const token = jwt.sign(payload, process.env.SECRET, { expiresIn: '12h' });
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

// WebAuthn Registration & Login Controllers
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
        authenticatorAttachment: 'platform', 
        residentKey: 'discouraged',          
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

exports.webauthnListCredentials = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('webauthnCredentials');
    if (!user) return res.sendStatus(401);

    const creds = (user.webauthnCredentials || []).map(c => ({
      credentialID: bufferToBase64url(Buffer.isBuffer(c.credentialID) ? c.credentialID : Buffer.from(c.credentialID)),
      label: c.label || '',
      transports: Array.isArray(c.transports) ? c.transports : [],
      fmt: c.fmt || '',
      aaguid: c.aaguid || '',
      counter: Number.isFinite(c.counter) ? c.counter : 0,
      userVerified: !!c.userVerified,
      lastUsedAt: c.lastUsedAt || null,
      createdAt: c.createdAt || null,
    }));

    return res.json({ credentials: creds });
  } catch (err) {
    console.error('[webauthnListCredentials] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not list credentials' });
  }
};

exports.webauthnRenameCredential = async (req, res) => {
  try {
    const { credId } = req.params;
    const { label } = req.body || {};
    if (typeof label !== 'string' || label.length > 120) {
      return res.status(400).json({ ok: false, error: 'Label must be a <=120 char string' });
    }

    const credBuf = base64urlToBuffer(credId);
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, 'webauthnCredentials.credentialID': credBuf },
      { $set: { 'webauthnCredentials.$.label': label.trim() } },
      { new: true, projection: { _id: 1 } }
    );

    if (!user) return res.status(404).json({ ok: false, error: 'Credential not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[webauthnRenameCredential] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not rename credential' });
  }
};

exports.webauthnDeleteCredential = async (req, res) => {
  try {
    const { credId } = req.params;
    const credBuf = base64urlToBuffer(credId);

    const user = await User.findById(req.user._id);
    if (!user) return res.sendStatus(401);

    const creds = Array.isArray(user.webauthnCredentials) ? user.webauthnCredentials : [];
    const currentlyEnforced =
      (String(process.env.MFA_REQUIRE_FOR_ENROLLED || '').toLowerCase() === 'true' && creds.length > 0)
      || user.mfaEnforced === true;

    if (currentlyEnforced && creds.length <= 1) {
      return res.status(400).json({ ok: false, error: 'Cannot remove the only device while MFA is enforced' });
    }

    const before = creds.length;
    user.webauthnCredentials = creds.filter(c => !(Buffer.isBuffer(c.credentialID) ? c.credentialID : Buffer.from(c.credentialID)).equals(credBuf));

    if (user.webauthnCredentials.length === before) {
      return res.status(404).json({ ok: false, error: 'Credential not found' });
    }

    if (user.webauthnCredentials.length === 0) {
      user.mfaEnrolledAt = undefined;
    }

    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[webauthnDeleteCredential] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not delete credential' });
  }
};

// TOTP Registration & Login Controllers
exports.totpEnrollStart = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.sendStatus(401);

    const issuer = APP_ISSUER;
    const label = `${issuer}:${user.username}`;

    const secret = new OTPAuth.Secret({ size: 20 }); 
    const secretBase32 = secret.base32;

    user.mfa ||= {};
    user.mfa.totp ||= {};
    user.mfa.totp.enabled = false;
    user.mfa.totp.secretEnc = encryptToken(secretBase32);  
    user.mfa.totp.issuer = issuer;
    user.mfa.totp.digits = TOTP_DIGITS;
    user.mfa.totp.period = TOTP_PERIOD;
    user.mfa.totp.algo = TOTP_ALGO;
    await user.save();

    const otpauth = makeOtpAuthUri({
      issuer,
      label,
      secret: secretBase32,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      algo: TOTP_ALGO
    });
    const qrPngDataUrl = await QRCode.toDataURL(otpauth);

    return res.json({
      otpauthUrl: otpauth,
      qrPngDataUrl,
      manualSecret: secretBase32
    });
  } catch (err) {
    console.error('[totpEnrollStart] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not start TOTP enrollment' });
  }
};

exports.totpEnrollVerify = async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ ok: false, error: 'Code required' });
    }

    const user = await User.findById(req.user._id);
    if (!user || !user.mfa || !user.mfa.totp || !user.mfa.totp.secretEnc) {
      return res.status(400).json({ ok: false, error: 'No TOTP pending enrollment' });
    }

    const secret = decryptToken(user.mfa.totp.secretEnc); // using your util
    const valid = verifyTotpCode({
      secret,
      code: code.trim(),
      digits: user.mfa.totp.digits || TOTP_DIGITS,
      period: user.mfa.totp.period || TOTP_PERIOD,
      algo: user.mfa.totp.algo || TOTP_ALGO
    });
    if (!valid) {
      return res.status(400).json({ ok: false, error: 'Invalid code' });
    }

    user.mfa.totp.enabled = true;
    user.mfa.totp.verifiedAt = new Date();
    user.mfa.totp.lastTimestepUsed = currentTimestep(user.mfa.totp.period || TOTP_PERIOD);

    if (!user.mfaEnrolledAt) user.mfaEnrolledAt = new Date();

    // Generate recovery codes
    const codes = generateRecoveryCodes();
    const hashed = await Promise.all(codes.map(c => argon2.hash(c)));
    user.mfa.totp.recoveryCodes = hashed.map(h => ({ hash: h, usedAt: null }));

    await user.save();
    return res.json({ ok: true, totpEnabled: true, recoveryCodes: codes });
  } catch (err) {
    console.error('[totpEnrollVerify] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not verify TOTP enrollment' });
  }
};

exports.totpLoginVerify = async (req, res) => {
  try {
    const { pendingLoginId, code } = req.body || {};
    if (!pendingLoginId || !code) {
      return res.status(400).json({ ok: false, error: 'pendingLoginId and code are required' });
    }

    const userId = popPendingLogin(pendingLoginId);
    if (!userId) return res.status(400).json({ ok: false, error: 'Pending login expired' });

    const user = await User.findById(userId).select('mfa username role');
    if (!user || !user.mfa || !user.mfa.totp || user.mfa.totp.enabled !== true || !user.mfa.totp.secretEnc) {
      return res.status(400).json({ ok: false, error: 'TOTP not enrolled' });
    }

    try {
      await Promise.all([
        limiterPending.consume(pendingLoginId),
        limiterUser.consume(String(user._id)),
      ]);
    } catch (rlErr) {
      const ms = Math.max(rlErr.msBeforeNext || 0, 1000);
      res.set('Retry-After', String(Math.ceil(ms / 1000)));
      return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' });
    }

    const period = user.mfa.totp.period || TOTP_PERIOD;
    const digits = user.mfa.totp.digits || TOTP_DIGITS;
    const algo = (user.mfa.totp.algo || TOTP_ALGO).toUpperCase();

    const secretBase32 = decryptToken(user.mfa.totp.secretEnc); // using your util
    const isValid = verifyTotpCode({
      secret: secretBase32,
      code: String(code).trim(),
      digits,
      period,
      algo,
      window: TOTP_WINDOW
    });
    if (!isValid) {
      return res.status(400).json({ ok: false, error: 'Invalid code' });
    }

    // Prevent same timestep reuse
    const step = currentTimestep(period);
    if (Number.isFinite(user.mfa.totp.lastTimestepUsed) && step <= user.mfa.totp.lastTimestepUsed) {
      return res.status(400).json({ ok: false, error: 'Code already used' });
    }
    user.mfa.totp.lastTimestepUsed = step;
    await user.save();

    const token = signJWT(user, true);
    res.cookie('jwt', token, cookieOpts());
    return res.json({ ok: true, mfa: true, token });
  } catch (err) {
    console.error('[totpLoginVerify] error:', err);
    return res.status(400).json({ ok: false, error: 'TOTP verification failed' });
  }
};

exports.totpDisable = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.mfa || !user.mfa.totp) return res.sendStatus(401);

    user.mfa.totp = {
      enabled: false,
      secretEnc: undefined,
      verifiedAt: undefined,
      lastTimestepUsed: undefined,
      issuer: undefined,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      algo: TOTP_ALGO,
      recoveryCodes: []
    };
    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[totpDisable] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not disable TOTP' });
  }
};

exports.totpRegenerateRecoveryCodes = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.mfa || !user.mfa.totp || user.mfa.totp.enabled !== true) {
      return res.status(400).json({ ok: false, error: 'TOTP not enabled' });
    }

    const codes = generateRecoveryCodes();
    const hashed = await Promise.all(codes.map(c => argon2.hash(c)));
    user.mfa.totp.recoveryCodes = hashed.map(h => ({ hash: h, usedAt: null }));
    await user.save();
    return res.json({ ok: true, recoveryCodes: codes });
  } catch (err) {
    console.error('[totpRegenerateRecoveryCodes] error:', err);
    return res.status(400).json({ ok: false, error: 'Could not regenerate recovery codes' });
  }
};