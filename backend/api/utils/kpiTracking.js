'use strict';

const KpiEvent = require('../../models/kpiEvent');
const { attribution } = require('./kpiContext');
let writeFailure = false;

async function recordEvents(events, user) {
  if (!events.length) return;
  let snapshot = {};
  try {
    snapshot = await attribution(user);
  } catch (error) {
    writeFailure = true;
    console.error('Unable to record KPI team attribution.', error);
  }
  try {
    await KpiEvent.insertMany(events.map((event) => ({ ...event, ...snapshot })));
  } catch (error) {
    // Telemetry must never turn a committed user action into a failed request.
    writeFailure = true;
    console.error('KPI event persistence failed; activity totals may be incomplete.', error);
  }
}

const ready = Promise.all([
  ['tracking-started', 'tracking_started'], ['team-tracking-started', 'team_tracking_started'],
].map(([id, kind]) => KpiEvent.updateOne(
  { _id: id },
  { $setOnInsert: { kind, at: new Date() } },
  { upsert: true }
).exec().catch((error) => {
  if (error.code === 11000) return; // Another application process initialized it.
  writeFailure = true;
  console.error('Unable to initialize KPI tracking coverage.', error);
})));

module.exports = {
  ready,
  recordEvents,
  recordLogin: (user) => recordEvents([{ kind: 'login', subject: String(user._id) }], user),
  hasWriteFailure: () => writeFailure,
};
