// One-off backfill: move inline IODA chart SVGs out of MongoDB into media storage.
//
// Before this change, IODA reports stored the full chart SVG (~330KB) inline at
// metadata.rawAPIResponse.image, bloating every document. The channel now stores a
// media-storage key instead. This script converts existing reports: it writes each
// inline SVG to storage (keyed by guid, same as the channel) and replaces the inline
// string with the returned key.
//
// Idempotent: only reports whose `image` is still an inline SVG (starts with '<') are
// touched, so re-running is a no-op. Run with: `node scripts/migrate-ioda-svg-to-storage.js`.

process.title = 'aggie-migrate-ioda-svg';

const database = require('../backend/database');
const Report = require('../backend/models/report');
const { persistSvgChart } = require('../backend/fetching/utils/socialImageStorage');
require('dotenv').config();

function isInlineSvg(value) {
  return typeof value === 'string' && value.trimStart().startsWith('<');
}

async function migrate() {
  // Match reports whose chart image is still an inline SVG string.
  const cursor = Report.find({
    _media: 'ioda',
    'metadata.rawAPIResponse.image': /^\s*</,
  }).cursor();

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (let report = await cursor.next(); report != null; report = await cursor.next()) {
    const svg = report.metadata && report.metadata.rawAPIResponse
      ? report.metadata.rawAPIResponse.image
      : null;

    if (!isInlineSvg(svg)) {
      skipped += 1; // already migrated (holds a key) or no image
      continue;
    }

    try {
      const key = await persistSvgChart({ svg, guid: report.guid });
      if (!key) {
        failed += 1;
        console.error(`No key returned for report ${report._id} (guid=${report.guid}).`);
        continue;
      }
      report.metadata.rawAPIResponse.image = key;
      report.markModified('metadata');
      await report.save();
      migrated += 1;
      if (migrated % 100 === 0) console.log(`...migrated ${migrated} so far`);
    } catch (err) {
      failed += 1;
      console.error(`Failed migrating report ${report._id} (guid=${report.guid}):`, err.message);
    }
  }

  console.log(`Done. migrated=${migrated}, skipped=${skipped}, failed=${failed}.`);
}

database.mongoose.connection.once('open', async () => {
  try {
    await migrate();
    process.exit(0);
  } catch (err) {
    console.error('Migration aborted:', err);
    process.exit(1);
  }
});
