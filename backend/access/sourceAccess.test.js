'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildReportSourceAccessFilter,
  canManageSource,
  canViewSource,
  canViewSourceDataForDate,
} = require('./sourceAccess');

const publicSource = { _id: 'public-source' };
const restrictedSource = {
  _id: 'restricted-source',
  accessPolicy: { mode: 'restricted', teams: ['team-a'] },
};
const cutoffSource = {
  _id: 'cutoff-source',
  accessPolicy: {
    mode: 'public_until',
    teams: ['team-a'],
    cutoffDate: '2026-01-01T00:00:00.000Z',
  },
};

test('legacy sources without a policy remain public', () => {
  assert.equal(canViewSource({ role: 'viewer', teams: [] }, publicSource), true);
});

test('restricted sources require an assigned team', () => {
  assert.equal(canViewSource({ role: 'viewer', teams: [] }, restrictedSource), false);
  assert.equal(canViewSource({ role: 'viewer', teams: ['team-a'] }, restrictedSource), true);
});

test('public_until preserves reports before the cutoff', () => {
  const user = { role: 'viewer', teams: [] };

  assert.equal(
    canViewSourceDataForDate(user, cutoffSource, '2025-12-31T23:59:59.000Z'),
    true
  );
  assert.equal(
    canViewSourceDataForDate(user, cutoffSource, '2026-01-01T00:00:00.000Z'),
    false
  );
});

test('report filter preserves source-less and orphaned legacy reports', () => {
  const filter = buildReportSourceAccessFilter(
    { role: 'viewer', teams: [] },
    [publicSource, restrictedSource]
  );

  assert.deepEqual(filter.$or[0], {
    _sources: { $nin: ['public-source', 'restricted-source'] },
  });
});

test('report filter gives team members full access to their restricted source', () => {
  const filter = buildReportSourceAccessFilter(
    { role: 'viewer', teams: ['team-a'] },
    [restrictedSource]
  );

  assert.deepEqual(filter.$or[1], {
    _sources: { $in: ['restricted-source'] },
  });
});

test('report filter adds a historical-only clause for public_until', () => {
  const filter = buildReportSourceAccessFilter(
    { role: 'viewer', teams: [] },
    [cutoffSource]
  );

  assert.equal(filter.$or.length, 2);
  assert.equal(filter.$or[1].$and[0]._sources, 'cutoff-source');
  assert.deepEqual(
    filter.$or[1].$and[1].$or[0].authoredAt,
    { $lt: new Date('2026-01-01T00:00:00.000Z') }
  );
});

test('admins do not receive a source filter', () => {
  assert.deepEqual(
    buildReportSourceAccessFilter({ role: 'admin' }, [restrictedSource]),
    {}
  );
});

test('only admins may manage source configuration', () => {
  assert.equal(canManageSource({ role: 'admin' }), true);
  assert.equal(canManageSource({ role: 'team_lead' }), false);
  assert.equal(canManageSource({ role: 'monitor' }), false);
  assert.equal(canManageSource({ role: 'viewer' }), false);
});
