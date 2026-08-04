'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PERMISSION_KEYS,
  getEffectivePermissions,
  hasPermission,
} = require('./permissions');

test('existing viewer and monitor role permissions remain unchanged', () => {
  const viewer = { role: 'viewer' };
  const monitor = { role: 'monitor' };

  assert.equal(hasPermission(viewer, 'view data'), true);
  assert.equal(hasPermission(viewer, 'edit data'), false);
  assert.equal(hasPermission(monitor, 'view data'), true);
  assert.equal(hasPermission(monitor, 'edit data'), true);
  assert.equal(hasPermission(monitor, 'manage sources'), false);
});

test('legacy team lead permissions remain unchanged', () => {
  const lead = { role: 'team_lead' };

  assert.equal(hasPermission(lead, 'view data'), true);
  assert.equal(hasPermission(lead, 'edit data'), true);
  assert.equal(hasPermission(lead, 'change settings'), true);
  assert.equal(hasPermission(lead, 'manage sources'), false);
});

test('an allow override grants a permission outside the role template', () => {
  const monitor = {
    role: 'monitor',
    permissionOverrides: { allow: ['edit tags'], deny: [] },
  };

  assert.equal(hasPermission(monitor, 'edit tags'), true);
});

test('a deny override removes a template permission and wins over allow', () => {
  const monitor = {
    role: 'monitor',
    permissionOverrides: {
      allow: ['edit data'],
      deny: ['edit data'],
    },
  };

  assert.equal(hasPermission(monitor, 'edit data'), false);
});

test('admins remain unrestricted even if an override contains a deny', () => {
  const admin = {
    role: 'admin',
    permissionOverrides: { allow: [], deny: ['manage sources'] },
  };

  assert.deepEqual(getEffectivePermissions(admin), [...PERMISSION_KEYS]);
  assert.equal(hasPermission(admin, 'manage sources'), true);
});

test('unknown permissions cannot be granted through overrides', () => {
  const viewer = {
    role: 'viewer',
    permissionOverrides: { allow: ['unknown permission'], deny: [] },
  };

  assert.equal(hasPermission(viewer, 'unknown permission'), false);
  assert.equal(getEffectivePermissions(viewer).includes('unknown permission'), false);
});
