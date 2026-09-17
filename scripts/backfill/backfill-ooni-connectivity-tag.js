// One-time backfill: attach the "connectivity test" SMTCTag to existing OONI
// reports that predate this tag being added to the live pipeline
// (backend/fetching/hooks/postToReport.js). Find-or-creates the tag by name,
// matching the same logic postToReport.js uses for new reports, so this and
// the live path can never end up with two differently-named tags for the
// same thing.

require('dotenv').config();
const database = require('../../backend/database');
const mongoose = database.mongoose;
const Report = require('../../backend/models/report');
const SMTCTag = require('../../backend/models/tag');

const OONI_TAG_NAME = 'connectivity test';

// Pass --dry-run to report the count without writing.
const DRY_RUN = process.argv.slice(2).includes('--dry-run');

async function run() {
  try {
    if (DRY_RUN) console.log('[DRY-RUN] No writes will be made.');

    let tag = await SMTCTag.findOne({ name: OONI_TAG_NAME });
    if (!tag) {
      console.log(`Tag "${OONI_TAG_NAME}" does not exist yet.`);
      if (DRY_RUN) {
        console.log('[DRY-RUN] Would create it, then tag matching reports.');
      } else {
        tag = await SMTCTag.create({
          name: OONI_TAG_NAME,
          description: 'OONI network connectivity measurement alerts',
        });
        console.log(`Created tag "${OONI_TAG_NAME}" (${tag._id}).`);
      }
    } else {
      console.log(`Using existing tag "${OONI_TAG_NAME}" (${tag._id}).`);
    }

    const filter = {
      _media: 'ooni',
      ...(tag ? { smtcTags: { $ne: tag._id } } : {}),
    };

    const count = await Report.countDocuments(
      tag ? filter : { _media: 'ooni' },
    );
    console.log(`OONI reports missing the tag: ${count}`);

    if (count === 0) {
      console.log('Nothing to update.');
      return;
    }

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would update ${count} document(s). Skipping write.`);
      return;
    }

    const result = await Report.updateMany(filter, {
      $addToSet: { smtcTags: tag._id },
      $set: { hasSMTCTags: true },
    });

    console.log('Backfill finished.');
    console.log(`Matched: ${result.matchedCount ?? result.n}`);
    console.log(`Modified: ${result.modifiedCount ?? result.nModified}`);
  } catch (err) {
    console.error('Backfill failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
