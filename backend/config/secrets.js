// sets up configuration to be used by the server
// uses nconf so that configuration can be overwritten by environment variables

var nconf = require('nconf');
var path = require('path');
var _ = require('lodash');
var mkdirp = require('mkdirp')

// load server preferences
var prefsFile = path.resolve(__dirname, 'server-prefs.json');
nconf.add('prefs', { type: 'file', file: prefsFile });

// get all configuration
var _configuration = nconf.get();

// set defaults
_.defaults(_configuration, { api_request_timeout: 60, logger: {} });

// return configuration
module.exports.get = function (options) {
  if (options && options.reload) {
    // Load again to get changes done in different processes
    nconf.load();
    _configuration = nconf.get();
  }
  return _configuration;
};

// update fetching flag
module.exports.updateFetching = function (flag, cb) {
  cb = cb || function () { };
  nconf.set('fetching', !!flag);
  nconf.save(function (err) {
    return cb(err);
  });
};

// update settings
module.exports.update = function (type, settings, cb) {
  cb = cb || function () { };

  nconf.set(type, settings);
  nconf.save(function (err) {
    return cb(err);
  });
};

// clear settings
module.exports.clear = function (key, cb) {
  cb = cb || function () { };

  nconf.clear(key);

  nconf.save(function (err) {
    return cb(err);
  });
};
