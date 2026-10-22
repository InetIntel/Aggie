'use strict';

/**
 * Backfill `outageStartedAt`, `geoScope`, `eventAggKeyBase` and
 * `metadata.rawAPIResponse.dataSource` on OONI reports created before the channel set them.
 *
 * The notable-activity aggregation (dashboard trend chart and cards) and the alerts
 * list's outage range filters only see reports that carry the outage fields, and the
 * card's Signals row and the alerts "Data Source" filter read dataSource, so legacy OONI
 * alerts are missing there until backfilled. Values come from the same helpers the
 * channel uses for new reports.
 *
 * Idempotent: only touches OONI reports missing an eventAggKeyBase or a dataSource.
 *
 * Usage: node backend/scripts/backfill-ooni-outage-fields.js [--dry-run]
 */

require('dotenv').config();

const database = require('../database'); // assumes this connects on require
const Report = require('../models/report');
const { outageFields, DATA_SOURCE } = require('../fetching/channels/ooni');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

const MISSING_FIELDS = {
  _media: 'ooni',
  $or: [
    { eventAggKeyBase: { $in: [null, ''] } },
    { 'metadata.rawAPIResponse.dataSource': { $in: [null, ''] } },
  ],
};

async function main() {
  const reports = await Report.find(MISSING_FIELDS)
    .select('_id metadata.rawAPIResponse.probeASN metadata.rawAPIResponse.probeCC metadata.rawAPIResponse.windowEnd')
    .lean();

  const updates = [];
  let skipped = 0;
  for (const report of reports) {
    const raw = (report.metadata && report.metadata.rawAPIResponse) || {};
    if (!raw.probeASN || !raw.windowEnd || isNaN(new Date(raw.windowEnd).getTime())) {
      skipped += 1;
      continue;
    }
    updates.push({
      updateOne: {
        filter: { _id: report._id },
        update: {
          $set: {
            ...outageFields({
              asn: raw.probeASN,
              probeCC: raw.probeCC || undefined,
              windowEnd: raw.windowEnd,
            }),
            'metadata.rawAPIResponse.dataSource': DATA_SOURCE,
          },
        },
      },
    });
  }

  console.log(`[backfill-ooni-outage-fields] Found ${reports.length} OONI reports missing outage fields or dataSource: ${updates.length} fixable, ${skipped} missing probeASN/windowEnd.`);

  if (DRY_RUN) {
    if (updates.length) {
      console.log('[backfill-ooni-outage-fields] Example update:', JSON.stringify(updates[0].updateOne));
    }
    console.log('[backfill-ooni-outage-fields] Dry run, no writes performed.');
    return;
  }

  let modified = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const result = await Report.bulkWrite(updates.slice(i, i + BATCH_SIZE), { ordered: false });
    modified += result.nModified ?? result.modifiedCount ?? 0;
  }

  console.log(`[backfill-ooni-outage-fields] Done. Updated ${modified} reports.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[backfill-ooni-outage-fields] Failed - ${err.message}`);
    process.exit(1);
  });
