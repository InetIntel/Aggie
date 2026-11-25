const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Stand in for the Report model so the hook can run without a database.
const reportPath = require.resolve(path.join(__dirname, '../../models/report'));
const created = [];
let failFor = () => false;
require.cache[reportPath] = {
  id: reportPath,
  filename: reportPath,
  loaded: true,
  exports: {
    create: async (doc) => {
      if (failFor(doc)) throw new Error("key www.wechat.com must not contain '.'");
      created.push(doc);
      return { _id: 'id' };
    },
  },
};
const storagePath = require.resolve(path.join(__dirname, '../utils/socialImageStorage'));
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: { deleteSocialAttachments: async () => {} },
};
const loggedEvents = [];
const channelPath = require.resolve(path.join(__dirname, '../sourceToChannel'));
require.cache[channelPath] = {
  id: channelPath,
  filename: channelPath,
  loaded: true,
  exports: {
    getSourceID: (channelID) => (channelID === 'known' ? 'source-1' : null),
    fetchSourceByID: async () => ({ logEvent: async (level, message) => loggedEvents.push({ level, message }) }),
  },
};
const saveToDatabase = require('./saveToDatabase');

const ooniReport = () => ({
  platform: 'ooni',
  guid: 'ooni:44244:domains:2026-11-09',
  metadata: { rawAPIResponse: { zeroDomains: ['a.example'], chart: { domains: [] } } },
});

test.beforeEach(() => {
  created.length = 0;
  loggedEvents.length = 0;
  failFor = () => false;
});

test('saves an OONI alert with its chart when nothing goes wrong', async () => {
  await saveToDatabase(ooniReport(), async () => {});
  assert.equal(created.length, 1);
  assert.ok(created[0].metadata.rawAPIResponse.chart);
});

test('saves the OONI alert without its chart when saving with the chart fails', async () => {
  failFor = (doc) => Boolean(doc.metadata.rawAPIResponse.chart);
  let nextCalled = false;
  const silence = console.warn;
  console.warn = () => {};
  try {
    await saveToDatabase(ooniReport(), async () => { nextCalled = true; });
  } finally {
    console.warn = silence;
  }

  assert.equal(created.length, 1);
  assert.equal(created[0].metadata.rawAPIResponse.chart, undefined);
  assert.deepEqual(created[0].metadata.rawAPIResponse.zeroDomains, ['a.example']);
  assert.ok(nextCalled);
});

test('does not retry reports that are not OONI alerts', async () => {
  failFor = () => true;
  const silence = console.error;
  console.error = () => {};
  try {
    await saveToDatabase({ platform: 'ioda', guid: 'x', metadata: { rawAPIResponse: { chart: {} } } }, async () => {});
  } finally {
    console.error = silence;
  }
  assert.equal(created.length, 0);
});

test('records a failed save on the source so it shows up in the UI', async () => {
  failFor = () => true;
  const silence = console.error;
  console.error = () => {};
  try {
    await saveToDatabase({ platform: 'rss', guid: 'g1', channel: 'known', metadata: {} }, async () => {});
  } finally {
    console.error = silence;
  }
  assert.equal(loggedEvents.length, 1);
  assert.equal(loggedEvents[0].level, 'error');
  assert.match(loggedEvents[0].message, /g1.*must not contain/);
});
