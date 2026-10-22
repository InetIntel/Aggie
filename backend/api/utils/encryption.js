const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; 
const IV_LENGTH = 12; 

function encryptToken(token) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}


function encryptSecrectsObject(secrets) {
    if (!secrets || typeof secrets !== 'object') {
        console.error('[debug-api-utils-encryption] Secrects must be an object.');
        return;
    }

    const encrypted = {};

    for (const key of Object.keys(secrets)) {
        const value = secrets[key];
        
        if (typeof value === 'string' && value.trim() !== '') {
            encrypted[key] = encryptToken(value);
        } else {
            // skip processing if not valid string
            encrypted[key] = value;
        }
    }

    return encrypted;
}

module.exports = { 
    encryptToken ,
    encryptSecrectsObject,

};