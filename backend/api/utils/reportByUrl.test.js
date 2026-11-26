'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportByUrlHandler } = require('./reportByUrl');
const { buildReportSourceAccessFilter } = require('../../access/sourceAccess');

const url = 'https://kolektiva.social/@iranluttes/117434410894758337';
function setup({ report = null, filter = {}, error } = {}) {
  let query, sent;
  const req = { query: { url }, user: { role: 'viewer' } };
  const res = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
  const handler = createReportByUrlHandler({
    Report: { findOne(value) { query = value; return { exec: async () => { if (error) throw error; return report; } }; } },
    getReportSourceAccessFilter: async (request) => { assert.equal(request, req); return filter; },
    combineReportFilters: (value, access) => Object.keys(access).length ? { $and: [value, access] } : value,
    sendReportResponse: async (...args) => { sent = args; },
  });
  return { req, res, handler, query: () => query, sent: () => sent };
}

test('exact URL lookup uses source permissions and the normal media/reference serializer', async () => {
  const filter = buildReportSourceAccessFilter({ role: 'viewer', teams: [] }, [
    { _id: 'private', accessPolicy: { mode: 'restricted', teams: ['team'] } },
    { _id: 'public', accessPolicy: { mode: 'public' } },
  ]);
  const report = { url, content: 'Post', metadata: { attachments: [{ imageKey: 'social/full/image.jpg' }] } };
  const context = setup({ report, filter });
  await context.handler(context.req, context.res);
  assert.deepEqual(context.query(), { $and: [{ url }, filter] });
  assert.deepEqual(context.sent(), [context.req, context.res, report, 200, { stripChart: false }]);
});

test('missing or inaccessible matches return the same null response', async () => {
  const context = setup({ filter: { _id: { $in: [] } } });
  await context.handler(context.req, context.res);
  assert.equal(context.res.code, 200);
  assert.equal(context.res.body, null);
  assert.equal(context.sent(), undefined);
});

test('admin lookup retains unrestricted exact equality including query parameters', async () => {
  const context = setup();
  context.req.query.url = `${url}?a=1&b=2`;
  await context.handler(context.req, context.res);
  assert.deepEqual(context.query(), { url: `${url}?a=1&b=2` });
});

test('invalid URL inputs never reach the database', async () => {
  for (const value of [undefined, { $ne: null }, [url], '', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com/' + 'a'.repeat(4096)]) {
    const context = setup();
    context.req.query.url = value;
    await context.handler(context.req, context.res);
    assert.equal(context.res.code, 400);
    assert.equal(context.query(), undefined);
  }
});

test('database errors return a safe error response', async () => {
  const context = setup({ error: new Error('private database details') });
  await context.handler(context.req, context.res);
  assert.equal(context.res.code, 500);
  assert.equal(context.res.body, 'Unable to look up report.');
});

test('Twitter/X matches the same status ID despite hostname and placeholder handle differences', async () => {
  const context = setup({ filter: { _sources: 'visible-source' } });
  context.req.query.url = 'https://x.com/clashreport/status/2110032049184657797?s=20';
  await context.handler(context.req, context.res);
  const [filter, access] = context.query().$and;
  assert.deepEqual(access, { _sources: 'visible-source' });
  assert.equal(filter.$or[1]._media, 'twitter');
  const pattern = new RegExp(filter.$or[1].url.$regex);
  assert.ok(pattern.test('https://twitter.com/temp/status/2110032049184657797'));
  assert.ok(pattern.test('https://x.com/clashreport/status/2110032049184657797?foo=bar'));
  assert.equal(pattern.test('https://twitter.com/temp/status/21100320491846577970'), false);
  assert.equal(pattern.test('https://evil.test/temp/status/2110032049184657797'), false);
});

test('untrusted hosts and nonnumeric status paths retain exact URL matching', async () => {
  for (const url of ['https://x.com.evil.test/user/status/123', 'https://example.com/user/status/123', 'https://x.com/user/status/123.*']) {
    const context = setup();
    context.req.query.url = url;
    await context.handler(context.req, context.res);
    assert.deepEqual(context.query(), { url });
  }
});
