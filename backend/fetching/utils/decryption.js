const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; 

function decryptToken(encryptedData) {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}


function decryptSecretsObject(secrets) {
    if (!secrets || typeof secrets !== 'object') {
        console.error('[debug-feching-utils-decryption] Secrect must be an object.');
        return;
    }

    const decrypted = {};
    for (const key of Object.keys(secrets)) {
        
        const value = secrets[key];

        if (typeof value === 'string') {
            decrypted[key] = decryptToken(value);
        } else {
            decrypted[key] = value;
        }
    }


    return decrypted;
}


module.exports = { 
    decryptToken ,
    decryptSecretsObject

};