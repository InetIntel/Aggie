'use strict';

const countries = require('i18n-iso-countries');

const normalizeCountryCodes = (countryCodes) => {
  if (!Array.isArray(countryCodes)) {
    const err = new Error('Country codes must be an array.');
    err.status = 400;
    throw err;
  }

  const normalized = countryCodes.map((code) => (
    typeof code === 'string' ? code.trim().toUpperCase() : ''
  ));

  if (normalized.some((code) => !countries.isValid(code))) {
    const err = new Error('Use valid two-letter country codes.');
    err.status = 400;
    throw err;
  }

  return [...new Set(normalized)];
};

module.exports = { normalizeCountryCodes };
