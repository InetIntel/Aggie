'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { countryExpression, asnExpression, locationPredicates } = require('./alertLocations');

const getPath = (value, path) => path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), value);

// Evaluates the aggregation operators these expressions use, so they can be
// checked without MongoDB. Any other operator throws, so a change to the
// expressions fails here instead of passing untested.
function evaluate(expr, doc, vars = {}) {
  if (typeof expr === 'string') {
    if (expr.startsWith('$$')) return getPath(vars, expr.slice(2));
    if (expr.startsWith('$')) return getPath(doc, expr.slice(1));
    return expr;
  }
  if (Array.isArray(expr)) return expr.map((item) => evaluate(item, doc, vars));
  if (expr === null || typeof expr !== 'object') return expr;
  const [op] = Object.keys(expr);
  const arg = expr[op];
  const ev = (item) => evaluate(item, doc, vars);
  switch (op) {
    case '$ifNull': {
      const value = ev(arg[0]);
      return value == null ? ev(arg[1]) : value;
    }
    case '$eq': return ev(arg[0]) === ev(arg[1]);
    case '$ne': return ev(arg[0]) !== ev(arg[1]);
    case '$in': return ev(arg[1]).includes(ev(arg[0]));
    case '$concat': return arg.map(ev).join('');
    case '$arrayElemAt': return ev(arg[0])[ev(arg[1])];
    case '$split': return ev(arg[0]).split(ev(arg[1]));
    case '$cond': return ev(arg[0]) ? ev(arg[1]) : ev(arg[2]);
    case '$switch': {
      const branch = arg.branches.find((item) => ev(item.case));
      return branch ? ev(branch.then) : ev(arg.default);
    }
    case '$let': {
      const bound = Object.fromEntries(Object.entries(arg.vars).map(([name, value]) => [name, ev(value)]));
      return evaluate(arg.in, doc, { ...vars, ...bound });
    }
    case '$regexFind': {
      const match = new RegExp(arg.regex, arg.options).exec(ev(arg.input));
      return match ? { match: match[0], idx: match.index, captures: match.slice(1) } : null;
    }
    default: throw new Error(`evaluate does not support ${op}`);
  }
}

// An alert as stored, with the legacy fields under metadata.rawAPIResponse.
const alert = ({ entityScope, ...fields } = {}) => ({
  ...fields,
  metadata: { rawAPIResponse: entityScope === undefined ? {} : { entityScope } },
});

const matches = (options, doc) => locationPredicates(options).every((predicate) => evaluate(predicate.$expr, doc));

test('country falls back to entityScope when geoScope is missing', () => {
  assert.equal(evaluate(countryExpression, alert({ entityScope: 'France' })), 'FR');
  assert.equal(evaluate(countryExpression, alert({ entityScope: 'Islamic Republic of Iran' })), 'IR');
  assert.equal(evaluate(countryExpression, alert({ entityScope: 'AS64500' })), null);
  assert.equal(evaluate(countryExpression, alert()), null);
});

test('country prefers countryCode, then geoScope, over entityScope', () => {
  assert.equal(evaluate(countryExpression, alert({ geoScope: 'Germany', entityScope: 'France' })), 'DE');
  assert.equal(evaluate(countryExpression, alert({ countryCode: 'MX', geoScope: 'Germany', entityScope: 'France' })), 'MX');
});

test('asn falls back to an AS-number entityScope when asn is missing', () => {
  assert.equal(evaluate(asnExpression, alert({ entityScope: 'AS64500' })), 'as64500');
  assert.equal(evaluate(asnExpression, alert({ entityScope: 'as64500' })), 'as64500');
  assert.equal(evaluate(asnExpression, alert({ entityScope: 'France' })), null);
  assert.equal(evaluate(asnExpression, alert({ entityScope: 'AS0' })), null);
  assert.equal(evaluate(asnExpression, alert({ entityScope: 'AS64500 extra' })), null);
  assert.equal(evaluate(asnExpression, alert()), null);
});

test('asn prefers the stored asn over entityScope', () => {
  assert.equal(evaluate(asnExpression, alert({ asn: 'as13335', entityScope: 'AS64500' })), 'as13335');
});

test('country and ASN filters match legacy alerts through the fallbacks', () => {
  const legacyCountry = alert({ entityScope: 'France' });
  const legacyAsn = alert({ entityScope: 'AS64500' });
  assert.equal(matches({ countries: 'FR' }, legacyCountry), true);
  assert.equal(matches({ countries: 'DE' }, legacyCountry), false);
  assert.equal(matches({ asns: '64500' }, legacyAsn), true);
  assert.equal(matches({ asns: 'AS64500' }, legacyAsn), true);
  assert.equal(matches({ asns: '64501' }, legacyAsn), false);
  assert.equal(matches({ asns: '64500' }, alert({ asn: 'as64500' })), true);
});

test('invalid filter values match nothing instead of everything', () => {
  assert.equal(matches({ asns: 'not-an-asn' }, alert({ entityScope: 'AS64500' })), false);
  assert.equal(matches({ countries: 'ZZ' }, alert({ entityScope: 'France' })), false);
});
