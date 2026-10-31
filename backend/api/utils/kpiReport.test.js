const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRange, buildPipeline, formatReport } = require('./kpiReport');

test('date range is UTC, inclusive, bounded, and rejects invalid dates', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const range = resolveRange({ start: '2026-10-01', end: '2026-10-02' }, now);
  assert.equal(range.start.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-10-03T00:00:00.000Z');
  assert.equal((resolveRange({}, now).end - resolveRange({}, now).start) / 86400000, 30);
  for (const query of [
    { start: '2026-02-30' }, { start: ['2026-01-01'] }, { start: '' },
    { start: '2026-10-02', end: '2026-10-01' }, { start: '2025-01-01' },
    { end: '2026-10-03' }, { end: 'garbage' },
  ]) assert.throws(() => resolveRange(query, now));
});

test('history has unavailable days, partial boundary days, and zero-filled complete days', () => {
  const range = resolveRange({ start: '2026-09-29', end: '2026-10-02' }, new Date('2026-10-02T12:00Z'));
  const report = formatReport(range, [
    { _id: { date: '2026-09-30', kind: 'login' }, actions: 5, uniqueSubjects: 2 },
    { _id: { date: '2026-10-02', kind: 'assigned', category: 'alerts' }, actions: 8, uniqueSubjects: 3 },
  ], new Date('2026-09-30T10:00Z'), new Date('2026-10-02T12:00Z'));
  assert.deepEqual(report.days.map((day) => day.coverage), ['unavailable', 'partial', 'complete', 'partial']);
  assert.equal(report.days[0].login, null);
  assert.equal(report.days[2].login, 0);
  assert.equal(report.totals.login, 5);
  assert.equal(report.totals.dailyUsers, 2);
  assert.equal(report.totals.alerts_assigned, 3);
  assert.equal(report.totals.social_assigned, 0);
});

test('missing coverage does not present fabricated zero totals', () => {
  const report = formatReport(resolveRange({}), [], null);
  assert.equal(report.totals.login, null);
  assert.ok(report.days.every((day) => day.coverage === 'unavailable'));
});

test('aggregation deduplicates subjects within each UTC day, action and category', () => {
  const range = resolveRange({});
  const pipeline = buildPipeline(range);
  assert.deepEqual(pipeline[0].$match.at, { $gte: range.start, $lt: range.end });
  assert.equal(pipeline[1].$group._id.subject, '$subject');
  assert.equal(pipeline[1].$group._id.date.$dateToString.timezone, 'UTC');
  assert.deepEqual(pipeline[2].$group.uniqueSubjects, { $sum: 1 });
});
