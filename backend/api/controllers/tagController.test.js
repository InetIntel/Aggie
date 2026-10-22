'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function controller(tagModel = {}) {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'tagController.js'), 'utf8'), {
    exports, console,
    require: (name) => name === 'lodash' ? require('lodash')
      : name === '../../models/tag' ? tagModel
      : name === '../../access/permissions' ? require('../../access/permissions')
      : name.includes('event-router') ? { publish: () => Promise.resolve() } : {},
  });
  return exports;
}

test('custom tag editing allows its creator and managers but rejects other users and standard-tag owners', async () => {
  for (const scenario of [
    { role: 'viewer', owner: 'actor', category: 'special', allowed: true },
    { role: 'viewer', owner: 'other', category: 'special', allowed: false },
    { role: 'viewer', owner: 'actor', category: 'cause', allowed: false },
    { role: 'admin', owner: 'other', category: 'special', allowed: true },
    { role: 'manager', owner: 'other', category: 'special', allowed: true },
    { role: 'viewer', owner: undefined, category: 'special', allowed: false },
  ]) {
    let saved = false;
    const tag = {
      name: 'Event', category: scenario.category, color: '#123456', user: scenario.owner,
      save: (callback) => { saved = true; callback(); },
    };
    const handlers = controller({ findById: (_id, callback) => callback(null, tag) });
    let status;
    const res = { status: (value) => { status = value; return res; },
      send: () => {}, sendStatus: (value) => { status = value; } };
    handlers.tag_update({ params: { _id: 'tag' }, accessUser: { _id: 'actor', role: scenario.role },
      body: { name: 'Renamed', color: '#abcdef', description: 'Updated', category: 'cause', user: 'hijack' } }, res);
    await Promise.resolve();
    assert.equal(saved, scenario.allowed, JSON.stringify(scenario));
    assert.equal(status, scenario.allowed ? 200 : 403);
    if (scenario.allowed) {
      assert.equal(tag.name, 'Renamed');
      assert.equal(tag.color, '#abcdef');
      assert.equal(tag.user, scenario.owner);
      assert.equal(tag.category, 'special');
    }
  }
});

test('special tag creation forces a shared special category and strips privileged fields', () => {
  const handlers = controller();
  let created;
  handlers.tag_create = (req) => { created = req.body; };
  handlers.tag_create_special({ body: {
    name: '  Election monitoring  ', color: '#123ABC', description: ' Event ',
    category: 'cause', user: 'another-user', _id: 'existing-tag', isBeingEdited: true,
  } }, {});
  assert.equal(created.name, 'Election monitoring');
  assert.equal(created.category, 'special');
  assert.equal(created.color, '#123ABC');
  assert.equal(created.description, 'Event');
  assert.deepEqual(Object.keys(created).sort(), ['category', 'color', 'description', 'isCommentTag', 'name']);
});

test('special tag creation rejects malformed input without writing', () => {
  for (const body of [{ name: '' }, { name: '   ' }, { name: {} },
    { name: 'x'.repeat(81) }, { name: 'Event', color: 'red' },
    { name: 'Event', description: {} }, { name: 'Event', description: 'x'.repeat(1001) }]) {
    const handlers = controller();
    handlers.tag_create = () => assert.fail('Invalid input must not be saved');
    let status;
    const res = { status: (value) => { status = value; return res; }, send: () => {} };
    handlers.tag_create_special({ body }, res);
    assert.equal(status, 400);
  }
});

test('special tag creation supplies a default color', () => {
  const handlers = controller();
  handlers.tag_create = (req) => assert.equal(req.body.color, '#7c3aed');
  handlers.tag_create_special({ body: { name: 'Event' } }, {});
});

test('custom creation and ownership-checked editing allow view-data users', () => {
  const routes = [];
  const router = Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) =>
    [method, (url, permission) => routes.push({ method, url, permission })]));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/tagRoutes.js'), 'utf8'), {
    module: {}, require: (name) => name === 'express' ? { Router: () => router }
      : name.includes('models/user') ? { can: (permission) => permission } : {},
  });
  assert.equal(routes.find((route) => route.url === '/special').permission, 'view data');
  assert.equal(routes.find((route) => route.url === '/special/:_id').permission, 'view data');
  for (const route of routes.filter((route) => route.method !== 'get' && !route.url.startsWith('/special'))) {
    assert.equal(route.permission, 'edit tags');
  }
});
