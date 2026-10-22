'use strict';
const countries = require('i18n-iso-countries');
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));
const scopes = require('../config/geoScopes.json');

// Read-time fallbacks only: historical records are never rewritten.
const countryByScope = new Map(Object.entries(countries.getNames('en')).map(([code, name]) => [name, code]));
for (const scope of scopes) countryByScope.set(scope.key, scope.countryCode);
const raw = '$metadata.rawAPIResponse';
const location = { $ifNull: [`${raw}.rawEvent.location`, ''] };
const level = `${raw}.entityLevel`;
const legacyRegion = {
  $switch: {
    branches: [
      { case: { $eq: [level, 'Region'] }, then: { $arrayElemAt: [{ $split: [location, '/'] }, 1] } },
      { case: { $eq: [level, 'AS - Region'] }, then: { $arrayElemAt: [{ $split: [location, '-'] }, 1] } },
    ], default: null,
  },
};
const countryExpression = { $ifNull: ['$countryCode', { $ifNull: [`${raw}.probeCC`, {
  $switch: {
    branches: [...countryByScope].map(([name, code]) => ({ case: { $eq: ['$geoScope', name] }, then: code })),
    default: null,
  },
}] }] };
const regionExpression = { $ifNull: ['$regionId', { $cond: [
  { $ne: [{ $ifNull: [legacyRegion, null] }, null] },
  { $concat: ['ioda:', legacyRegion] }, null,
] }] };

function normalizeValues(value, kind) {
  const values = (Array.isArray(value) ? value : String(value || '').split(','))
    .map(v => String(v).trim()).filter(Boolean);
  return [...new Set(values.map(v => kind === 'countries' ? v.toUpperCase() : kind === 'asns' ? `as${v.replace(/^as/i, '')}` : v))]
    .filter(v => kind === 'countries' ? /^[A-Z]{2}$/.test(v) && countries.isValid(v) : kind === 'asns' ? /^as[1-9]\d*$/.test(v) && Number(v.slice(2)) <= 4294967295 : /^ioda:\d+$/.test(v));
}

function locationPredicates(options) {
  return ['countries', 'asns', 'regions'].flatMap(kind => {
    if (!options[kind] || (Array.isArray(options[kind]) && !options[kind].length)) return [];
    const values = normalizeValues(options[kind], kind);
    // Invalid nonempty input must never silently broaden the query.
    return [kind === 'asns' ? { asn: { $in: values } } : { $expr: { $in: [kind === 'countries' ? countryExpression : regionExpression, values] } }];
  });
}
module.exports = { countryExpression, regionExpression, normalizeValues, locationPredicates };
