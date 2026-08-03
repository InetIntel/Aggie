'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canCreateOrDeleteTeams,
  canManageTeam,
  isExplicitTeamLead,
} = require('./teamAccess');

const team = { _id: 'team-a', leads: ['lead-a'] };

test('admins can manage every team', () => {
  assert.equal(canManageTeam({ _id: 'admin', role: 'admin' }, team), true);
});

test('explicit leads can manage only their assigned team', () => {
  const lead = { _id: 'lead-a', role: 'monitor' };
  assert.equal(isExplicitTeamLead(lead, team), true);
  assert.equal(canManageTeam(lead, team), true);
  assert.equal(canManageTeam(lead, { _id: 'team-b', leads: [] }), false);
});

test('legacy global team leads retain compatibility access', () => {
  const legacyLead = { _id: 'legacy-lead', role: 'team_lead' };
  assert.equal(canManageTeam(legacyLead, { _id: 'team-b', leads: [] }), true);
  assert.equal(canCreateOrDeleteTeams(legacyLead), true);
});

test('ordinary members cannot manage or delete teams', () => {
  const member = { _id: 'member-a', role: 'monitor' };
  assert.equal(canManageTeam(member, team), false);
  assert.equal(canCreateOrDeleteTeams(member), false);
});
