/**
 * User-Agent identifying requests as coming from Aggie, so API providers
 * (Cloudflare, IODA, ...) can tell our polling apart from generic bots.
 * Node's default fetch User-Agent ("node") is a red flag for providers
 * looking to block or rate-limit unwanted API users.
 */
const { version } = require('../../../package.json');

const AGGIE_USER_AGENT = `Aggie/${version} (+https://github.com/InetIntel/Aggie)`;

module.exports = { AGGIE_USER_AGENT };
