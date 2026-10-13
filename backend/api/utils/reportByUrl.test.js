'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportByUrlHandler } = require('./reportByUrl');
const url = 'https://kolektiva.social/@iranluttes/117434410894758337';

function setup({ report = null, error } = {}) {
  let query, sent;
  const req = { query: { url } };
  const res = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
  const handler = createReportByUrlHandler({
    Report: {
      findOne(value) {
        query = value;
        return { exec: async () => { if (error) throw error; return report; } };
      },
    },
    sendReportResponse: async (...args) => { sent = args; },
  });
  return { req, res, handler, query: () => query, sent: () => sent };
}

test('exact URL lookup uses the normal report response handler', async () => {
  const report = { url, content: 'Post', metadata: { mediaUrl: 'https://example.com/image.jpg' } };
  const context = setup({ report });
  await context.handler(context.req, context.res);
  assert.deepEqual(context.query(), { url });
  assert.deepEqual(context.sent(), [context.req, context.res, report]);
});

test('missing posts return null', async () => {
  const context = setup();
  await context.handler(context.req, context.res);
  assert.equal(context.res.code, 200);
  assert.equal(context.res.body, null);
});

test('URL queries retain exact equality', async () => {
  const context = setup();
  context.req.query.url = url + '?a=1&b=2';
  await context.handler(context.req, context.res);
  assert.deepEqual(context.query(), { url: url + '?a=1&b=2' });
});

test('invalid inputs never reach the database', async () => {
  for (const value of [undefined, { $ne: null }, [url], '', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com/' + 'a'.repeat(4096)]) {
    const context = setup();
    context.req.query.url = value;
    await context.handler(context.req, context.res);
    assert.equal(context.res.code, 400);
    assert.equal(context.query(), undefined);
  }
});

test('database failures return a safe error', async () => {
  const context = setup({ error: new Error('private details') });
  await context.handler(context.req, context.res);
  assert.equal(context.res.code, 500);
  assert.equal(context.res.body, 'Unable to look up report.');
});

test('Twitter/X aliases match numeric status IDs independently of handle', async () => {
  const context = setup();
  context.req.query.url = 'https://x.com/clashreport/status/2110032049184657797?s=20';
  await context.handler(context.req, context.res);
  assert.equal(context.query().$or[1]._media, 'twitter');
  const regex = new RegExp(context.query().$or[1].url.$regex);
  assert.ok(regex.test('https://twitter.com/temp/status/2110032049184657797'));
  assert.ok(regex.test('https://x.com/clashreport/status/2110032049184657797?foo=bar'));
  assert.equal(regex.test('https://twitter.com/temp/status/21100320491846577970'), false);
  assert.equal(regex.test('https://evil.test/temp/status/2110032049184657797'), false);
});

test('untrusted hosts and nonnumeric status paths retain exact matching', async () => {
  for (const value of ['https://x.com.evil.test/user/status/123', 'https://example.com/user/status/123', 'https://x.com/user/status/123.*']) {
    const context = setup();
    context.req.query.url = value;
    await context.handler(context.req, context.res);
    assert.deepEqual(context.query(), { url: value });
  }
});
