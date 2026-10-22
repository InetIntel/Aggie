'use strict';

/**
 * Backfill `isOutageOngoing` on outage reports created before the field existed.
 *
 * The alerts "Status" filter queries this flag, and a missing value is indistinguishable
 * from `false` in Mongo — so without this, every legacy report reads as ended. An outage
 * with no `outageEndedAt` is still running; anything with an end time is done.
 *
 * Idempotent: only touches documents where the field is absent.
 *
 * Usage: node backend/scripts/backfill-outage-ongoing.js [--dry-run]
 */

require('dotenv').config();

const database = require('../database'); // assumes this connects on require
const Report = require('../models/report');

const DRY_RUN = process.argv.includes('--dry-run');

const MISSING_FLAG = { isOutageEvent: true, isOutageOngoing: { $exists: false } };
const NO_END = { $or: [{ outageEndedAt: null }, { outageEndedAt: { $exists: false } }] };

async function main() {
  const missing = await Report.countDocuments(MISSING_FLAG);
  const ongoing = await Report.countDocuments({ ...MISSING_FLAG, ...NO_END });
  const ended = missing - ongoing;

  console.log(`[backfill-outage-ongoing] Found ${missing} outage reports without the flag: ${ongoing} still running, ${ended} ended.`);

  if (DRY_RUN) {
    console.log('[backfill-outage-ongoing] Dry run, no writes performed.');
    return;
  }

  const ongoingResult = await Report.updateMany(
    { ...MISSING_FLAG, ...NO_END },
    { $set: { isOutageOngoing: true } }
  );

  const endedResult = await Report.updateMany(
    { ...MISSING_FLAG, outageEndedAt: { $ne: null, $exists: true } },
    { $set: { isOutageOngoing: false } }
  );

  console.log(`[backfill-outage-ongoing] Done. Marked ongoing: ${ongoingResult.nModified ?? ongoingResult.modifiedCount}, marked ended: ${endedResult.nModified ?? endedResult.modifiedCount}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[backfill-outage-ongoing] Failed - ${err.message}`);
    process.exit(1);
  });
