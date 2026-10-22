'use strict';

const KpiEvent = require('../../models/kpiEvent');
let writeFailure = false;

async function recordEvents(events) {
  if (!events.length) return;
  try {
    await KpiEvent.insertMany(events);
  } catch (error) {
    // Telemetry must never turn a committed user action into a failed request.
    writeFailure = true;
    console.error('KPI event persistence failed; activity totals may be incomplete.', error);
  }
}

const ready = KpiEvent.updateOne(
  { _id: 'tracking-started' },
  { $setOnInsert: { kind: 'tracking_started', at: new Date() } },
  { upsert: true }
).exec().catch((error) => {
  if (error.code === 11000) return; // Another application process initialized it.
  writeFailure = true;
  console.error('Unable to initialize KPI tracking coverage.', error);
});

module.exports = {
  ready,
  recordEvents,
  recordLogin: (user) => recordEvents([{ kind: 'login', subject: String(user._id) }]),
  hasWriteFailure: () => writeFailure,
};
