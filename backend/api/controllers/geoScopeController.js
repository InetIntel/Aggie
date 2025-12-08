'use strict';
const User = require('../../models/user'); 
const { GEO_SCOPE_OPTIONS } = require('../../config/geoScopes');

exports.geoScope_list = (req, res) => {
  res.status(200).json(
    GEO_SCOPE_OPTIONS.map((g) => ({
      key: g.key,
      value: g.value,
      level: g.level,
      countryCode: g.countryCode
    }))
  );
};