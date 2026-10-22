// Handles requests for manipulating backend settings
// See https://developer.mozilla.org/en-US/docs/Web/HTTP/Status for sending correct error responses
'use strict';

var config = require('../../config/secrets');
const settingsHandler = require('../settings-handler');
  // Enable/disable global fetching
exports.setting_update_fetch = (req, res, app) => {
  var fetching = null;
  switch (req.params.status) {
    case 'on':
      fetching = true;
      break;
    case 'off':
      fetching = false;
      break;
    default:
      return res.sendStatus(404);
  }
  // save fetching status
  config.updateFetching(fetching, (err) => {
    if (err) return res.sendStatus(500);
    res.sendStatus(200);
    settingsHandler.emit(fetching ? 'fetching:start' : 'fetching:stop');
  });
}


// Get any setting
exports.setting_setting = (req, res) => {
  let result = {};
  result[req.params.setting] = config.get({ reload: true })[req.params.setting];
  result.setting = req.params.setting;
  res.status(200).send(result);
}

// Modify setting
exports.setting_update = (req, res, app) => {
  config.update(req.params.entry, req.body.settings, (err) => {
    if (err) return res.send(500);
    // Updating settings may require to reload or reset bots or other modules
    app.emit('settingsUpdated', { setting: req.params.entry });
    res.sendStatus(200);
  });
}
  // Clear setting
exports.setting_delete = (req, res) => {
  config.clear(req.params.entry, (err) => {
    if (err) res.send(500);
    res.sendStatus(200);
  });
}


