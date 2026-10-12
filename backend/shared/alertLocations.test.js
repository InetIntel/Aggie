const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { normalizeValues, locationPredicates } = require('./alertLocations');

test('normalizes multi-value URL and socket inputs and rejects invalid identifiers', () => {
  assert.deepEqual(normalizeValues(' ir, RU,IR,invalid', 'countries'), ['IR', 'RU']);
  assert.deepEqual(normalizeValues(['AS15169', '15169', 'as44244', '-1', '4294967296'], 'asns'), ['as15169', 'as44244']);
  assert.deepEqual(normalizeValues('ioda:1843,ioda:4442,arbitrary', 'regions'), ['ioda:1843', 'ioda:4442']);
  assert.deepEqual(locationPredicates({ countries: [], asns: '', regions: [] }), []);
  assert.deepEqual(locationPredicates({ asns: 'invalid' }), [{ asn: { $in: [] } }]);
});

// Exercise the real query builder without opening a database connection.
function loadQuery() {
  const filename = path.resolve(__dirname, '../models/query/report-query.js');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = name => name === '../report' ? {} : name === '../query' ? function Query() {} : originalRequire(name);
  mod._compile(fs.readFileSync(filename, 'utf8'), filename);
  return mod.exports;
}
test('combines location selections with existing filters, using OR within each dimension', () => {
  const Query = loadQuery();
  const filter = new Query({ countries: 'IR,RU', asns: ['15169', '44244'], regions: ['ioda:1843'],
    entityLevel: ['AS', 'AS - Region'], media: ['ioda', 'ooni'], irrelevant: 'all' }).toMongooseFilter();
  assert.deepEqual(filter._media, { $in: ['ioda', 'ooni'] });
  assert.equal(filter.$and.length, 5);
  assert.deepEqual(filter.$and[2].$expr.$in[1], ['IR', 'RU']);
  assert.deepEqual(filter.$and[3], { asn: { $in: ['as15169', 'as44244'] } });
  assert.deepEqual(filter.$and[4].$expr.$in[1], ['ioda:1843']);
  assert.notDeepEqual(new Query({ countries: 'IR' }).normalize(), new Query({ countries: 'RU' }).normalize());
});
