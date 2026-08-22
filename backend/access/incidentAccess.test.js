'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildIncidentAccessFilter,
  canSetIncidentPolicy,
  canViewIncident,
  getAccessibleTeamIds,
  getIncidentPolicy,
} = require('./incidentAccess');

const publicIncident = {
  _id: 'public-incident',
  accessPolicy: { mode: 'public', teams: [] },
};

const restrictedIncident = {
  _id: 'restricted-incident',
  accessPolicy: { mode: 'restricted', teams: ['team-a'] },
};

test('legacy incidents without an access policy remain public', () => {
  assert.deepEqual(getIncidentPolicy({ _id: 'legacy-incident' }), {
    mode: 'public',
    teams: [],
  });
  assert.equal(
    canViewIncident({ role: 'viewer', teams: [] }, { _id: 'legacy-incident' }),
    true
  );
});

test('public incidents remain visible to authenticated roles', () => {
  assert.equal(canViewIncident({ role: 'viewer', teams: [] }, publicIncident), true);
});

test('restricted incidents require an assigned team', () => {
  assert.equal(
    canViewIncident({ role: 'viewer', teams: ['team-a'] }, restrictedIncident),
    true
  );
  assert.equal(
    canViewIncident({ role: 'viewer', teams: ['team-b'] }, restrictedIncident),
    false
  );
});

test('explicit team leads can view incidents for teams they lead', () => {
  const lead = { role: 'monitor', teams: [] };

  assert.equal(canViewIncident(lead, restrictedIncident, ['team-a']), true);
  assert.equal(canViewIncident(lead, restrictedIncident, ['team-b']), false);
});

test('admins can view restricted incidents without a team assignment', () => {
  assert.equal(canViewIncident({ role: 'admin', teams: [] }, restrictedIncident), true);
  assert.deepEqual(buildIncidentAccessFilter({ role: 'admin' }), {});
});

test('restricted policies without teams fail closed', () => {
  const incident = {
    accessPolicy: { mode: 'restricted', teams: [] },
  };

  assert.equal(canViewIncident({ role: 'viewer', teams: [] }, incident), false);
});

test('membership and explicit leadership are combined without duplicates', () => {
  assert.deepEqual(
    getAccessibleTeamIds(
      { role: 'monitor', teams: ['team-a', 'team-b'] },
      ['team-b', 'team-c']
    ),
    ['team-a', 'team-b', 'team-c']
  );
});

test('incident list filters include public and assigned restricted incidents', () => {
  assert.deepEqual(
    buildIncidentAccessFilter(
      { role: 'viewer', teams: ['team-a'] },
      ['team-b']
    ),
    {
      $or: [
        { 'accessPolicy.mode': { $exists: false } },
        { 'accessPolicy.mode': 'public' },
        {
          'accessPolicy.mode': 'restricted',
          'accessPolicy.teams': { $in: ['team-a', 'team-b'] },
        },
      ],
    }
  );
});

test('role templates allow administrators and legacy team leads to set policies', () => {
  const policy = { mode: 'restricted', teams: ['team-a'] };

  assert.equal(canSetIncidentPolicy({ role: 'admin' }, policy), true);
  assert.equal(canSetIncidentPolicy({ role: 'team_lead' }, policy), true);
  assert.equal(canSetIncidentPolicy({ role: 'monitor' }, policy), false);
});

test('explicit team leads can restrict incidents only to teams they lead', () => {
  const explicitLead = { role: 'monitor', teams: ['team-a', 'team-b'] };

  assert.equal(
    canSetIncidentPolicy(
      explicitLead,
      { mode: 'restricted', teams: ['team-a'] },
      ['team-a']
    ),
    true
  );
  assert.equal(
    canSetIncidentPolicy(
      explicitLead,
      { mode: 'restricted', teams: ['team-b'] },
      ['team-a']
    ),
    false
  );
});

test('explicit team leads can make their own restricted incident public', () => {
  const explicitLead = { role: 'monitor', teams: [] };

  assert.equal(
    canSetIncidentPolicy(
      explicitLead,
      { mode: 'public', teams: [] },
      ['team-a'],
      restrictedIncident
    ),
    true
  );
  assert.equal(
    canSetIncidentPolicy(
      explicitLead,
      { mode: 'public', teams: [] },
      ['team-b'],
      restrictedIncident
    ),
    false
  );
});

test('explicit team leads can submit an unchanged public policy while editing', () => {
  const explicitLead = { role: 'monitor', teams: [] };

  assert.equal(
    canSetIncidentPolicy(
      explicitLead,
      { mode: 'public', teams: [] },
      ['team-a'],
      publicIncident
    ),
    true
  );
});

test('explicit leads cannot remove access from teams they do not lead', () => {
  const explicitLead = { role: 'monitor', teams: [] };
  const sharedIncident = {
    accessPolicy: {
      mode: 'restricted',
      teams: ['team-a', 'team-b'],
    },
  };

  assert.equal(
    canSetIncidentPolicy(
      explicitLead,
      { mode: 'restricted', teams: ['team-a'] },
      ['team-a'],
      sharedIncident
    ),
    false
  );
  assert.equal(
    canSetIncidentPolicy(
      explicitLead,
      { mode: 'restricted', teams: ['team-a', 'team-b'] },
      ['team-a'],
      sharedIncident
    ),
    true
  );
});

test('a permission override can grant incident access management', () => {
  const monitor = {
    role: 'monitor',
    permissionOverrides: {
      allow: ['manage incident access'],
      deny: [],
    },
  };

  assert.equal(
    canSetIncidentPolicy(
      monitor,
      { mode: 'restricted', teams: ['team-a'] }
    ),
    true
  );
});
