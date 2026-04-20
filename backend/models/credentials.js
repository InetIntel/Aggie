/* eslint-disable no-invalid-this */
// Represents a set of credentials that you want to keep protected.
'use strict';

const credentialsTypes = require('../config/models/credentialsConfigs');
const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;
const validator = require('validator');


// validates secrete based on their type
const secretsValidator = function(secrets) {
  function isValidString(value) {
    return (
      typeof value === 'string'
      && value.length > 0
    );
  }

  if (typeof secrets !== 'object') return false;

  switch (this.type) {
  case 'crowdtangle':
    return isValidString(secrets.dashboardAPIToken); // dashboard API token
  case 'twitter':
    return (
      isValidString(secrets.consumerKey)
      && isValidString(secrets.consumerSecret)
      && isValidString(secrets.accessToken)
      && isValidString(secrets.accessTokenSecret)
    );
  case 'junkipedia':
    return isValidString(secrets.junkipediaAPIKey);
  case 'cloudflare':
    return isValidString(secrets.cloudflareApiToken);
  case 'telegramBot':
    return isValidString(secrets.botAPIToken);
  case 'mastodon':
    return (
      isValidString(secrets.serverUrl)
      && isValidString(secrets.clientId)
      && isValidString(secrets.clientSecret)
      && isValidString(secrets.accessToken)
    );
  case 'ioda':
    return true;
  default:
    return true;
  }
};

const nameValidator = function(name) {
  return validator.isLength(name, {min: 1, max: 20});
}

const credentialsSchema = new Schema({
  name: { type: String, required: true, validate: nameValidator },
  secrets: { type: Schema.Types.Mixed, validate: secretsValidator },
  type: { type: String, required: true, enum: credentialsTypes }
});

credentialsSchema.methods.stripSecrets = function() {
  this.secrets = undefined;
};

const Credentials = mongoose.model('Credentials', credentialsSchema);

module.exports = Credentials;
