'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getMembershipRole,
  getMembershipTeamIds,
  getTeamIdsWithPermission,
} = require('./teamMemberships');

test('a global viewer can be a monitor on one team and a viewer on another', () => {
  const user = {
    role: 'viewer',
    teams: ['team-a', 'team-b'],
    teamMemberships: [
      { team: 'team-a', role: 'monitor' },
      { team: 'team-b', role: 'viewer' },
    ],
  };

  assert.equal(getMembershipRole(user, 'team-a'), 'monitor');
  assert.equal(getMembershipRole(user, 'team-b'), 'viewer');
  assert.deepEqual(getTeamIdsWithPermission(user, 'edit data'), ['team-a']);
});

test('explicit team leadership grants the scoped team lead role', () => {
  const user = {
    role: 'viewer',
    teams: ['team-a'],
    teamMemberships: [{ team: 'team-a', role: 'viewer' }],
  };

  assert.equal(getMembershipRole(user, 'team-a', ['team-a']), 'team_lead');
  assert.deepEqual(
    getTeamIdsWithPermission(user, 'manage incident access', ['team-a']),
    ['team-a']
  );
});

test('legacy memberships fall back to the existing global role', () => {
  const user = { role: 'monitor', teams: ['team-a'] };

  assert.equal(getMembershipRole(user, 'team-a'), 'monitor');
  assert.deepEqual(getTeamIdsWithPermission(user, 'edit data'), ['team-a']);
});

test('membership ids combine new and legacy fields without duplicates', () => {
  const user = {
    teams: ['team-a'],
    teamMemberships: [
      { team: 'team-a', role: 'viewer' },
      { team: 'team-b', role: 'monitor' },
    ],
  };

  assert.deepEqual(getMembershipTeamIds(user), ['team-a', 'team-b']);
});
