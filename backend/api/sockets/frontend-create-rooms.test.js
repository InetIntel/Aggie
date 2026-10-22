const assert = require('node:assert/strict');
const test = require('node:test');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const EventRouter = require('./event-router');
const createRooms = require('./frontend-create-rooms');

test('report, source, and incident notifications leave out record data', { timeout: 5000 }, async (t) => {
  const server = createServer();
  const clients = [];
  const originalCallbacks = EventRouter.eventCallbacks;
  EventRouter.eventCallbacks = {};

  t.after(async () => {
    clients.forEach((client) => client.close());
    EventRouter.eventCallbacks = originalCallbacks;
    await new Promise((resolve) => server.close(resolve));
  });

  createRooms(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const namespace of ['sources', 'reports']) {
    const client = io(`${base}/${namespace}`, {
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    const events = namespace === 'sources'
      ? ['sources:create', 'sources:update', 'sources:delete']
      : ['reports:create', 'reports:update', 'reports:delete', 'reports:read',
        'groups:create', 'groups:update', 'groups:delete'];

    for (const event of events) {
      const received = once(client, event);
      await EventRouter.publish(event, {
        _id: 'private-record',
        title: 'Restricted content',
        accessPolicy: { mode: 'restricted', teams: ['team-a'] },
      });
      const [message] = await received;
      assert.deepEqual(message, { event, data: null });
    }
  }
});
