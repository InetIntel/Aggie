/**
 * ONE-OFF backfill: populate metadata.rawAPIResponse.chart (signal series) on existing
 * legacy IODA reports that only have the scraped `image`. Idempotent — skips reports that
 * already have `chart`. Leaves `image` in place as a fallback (the frontend prefers `chart`
 * when present), so nothing breaks if a signals fetch fails; retiring the old SVG files is a
 * separate, deliberate cleanup step.
 *
 *   node scripts/backfill/backfill-ioda-charts.js            # apply
 *   node scripts/backfill/backfill-ioda-charts.js --dry-run  # report only, no writes
 */
require('../../backend/database'); // side-effect: connects mongoose
const mongoose = require('mongoose');
const Report = require('../../backend/models/report');
const { fetchSignals } = require('../../backend/fetching/utils/iodaUtils');

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_POINTS = 150;
const BATCH = 200;

// The stored dashboard link carries the exact [from, until] window IODA showed.
function parseWindow(url) {
  try {
    const u = new URL(url);
    return { from: Number(u.searchParams.get('from')), until: Number(u.searchParams.get('until')) };
  } catch {
    return null;
  }
}

async function main() {
  await new Promise((res, rej) => {
    mongoose.connection.once('open', res);
    mongoose.connection.once('error', rej);
  });

  const filter = {
    'metadata.rawAPIResponse.image': { $regex: '^ioda/charts/' },
    'metadata.rawAPIResponse.chart': { $exists: false },
    'metadata.rawAPIResponse.rawEvent.location': { $exists: true },
  };

  const total = await Report.countDocuments(filter);
  console.log(`${total} legacy IODA reports need backfill${DRY_RUN ? ' (dry run)' : ''}.`);

  let processed = 0;
  let populated = 0;
  let skipped = 0;

  // Cursor keeps memory flat over a large corpus.
  const cursor = Report.find(filter).cursor();
  for (let report = await cursor.next(); report != null; report = await cursor.next()) {
    processed += 1;
    const raw = report.metadata && report.metadata.rawAPIResponse;
    const entity = raw && raw.rawEvent && raw.rawEvent.location;
    const win = raw && parseWindow(report.url);

    if (!entity || !win || !win.from || !win.until) {
      skipped += 1;
      continue;
    }

    let chart;
    try {
      chart = await fetchSignals({ entity, from: win.from, until: win.until, maxPoints: MAX_POINTS });
    } catch (e) {
      console.warn(`  skip ${report.guid}: signals fetch failed: ${e.message}`);
      skipped += 1;
      continue;
    }

    // No usable series (entity has no data over that window) — keep the old image.
    if (!chart || !chart.series.length) {
      skipped += 1;
      continue;
    }

    if (!DRY_RUN) {
      report.metadata.rawAPIResponse.chart = chart;
      report.markModified('metadata');
      await report.save();
    }
    populated += 1;

    if (processed % BATCH === 0) {
      console.log(`  …${processed}/${total} processed, ${populated} populated, ${skipped} skipped`);
    }
  }

  console.log(
    `Done. processed=${processed} populated=${populated} skipped=${skipped}${DRY_RUN ? ' (dry run — no writes)' : ''}`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
