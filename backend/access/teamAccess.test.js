'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canAssignCreatedUserToTeams,
  canCreateOrDeleteTeams,
  canCreateUserRole,
  canCreateUsers,
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

test('explicit team leads can create ordinary users only for teams they lead', () => {
  const lead = { _id: 'lead-a', role: 'monitor' };

  assert.equal(canCreateUsers(lead, ['team-a']), true);
  assert.equal(canCreateUserRole(lead, 'viewer'), true);
  assert.equal(canCreateUserRole(lead, 'monitor'), true);
  assert.equal(canCreateUserRole(lead, 'admin'), false);
  assert.equal(
    canAssignCreatedUserToTeams(lead, ['team-a'], ['team-a']),
    true
  );
  assert.equal(
    canAssignCreatedUserToTeams(lead, ['team-b'], ['team-a']),
    false
  );
  assert.equal(canAssignCreatedUserToTeams(lead, [], ['team-a']), false);
});

test('admins and legacy team leads retain user creation compatibility', () => {
  const admin = { _id: 'admin', role: 'admin' };
  const legacyLead = { _id: 'legacy', role: 'team_lead' };

  assert.equal(canCreateUsers(admin), true);
  assert.equal(canCreateUserRole(admin, 'admin'), true);
  assert.equal(canAssignCreatedUserToTeams(admin, ['team-b']), true);

  assert.equal(canCreateUsers(legacyLead), true);
  assert.equal(canCreateUserRole(legacyLead, 'monitor'), true);
  assert.equal(canCreateUserRole(legacyLead, 'team_lead'), false);
  assert.equal(canAssignCreatedUserToTeams(legacyLead, []), true);
});
