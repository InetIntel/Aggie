// One-time backfill: convert legacy IODA chart SVGs into compact signal JSON.
//
// New IODA reports already store `metadata.rawAPIResponse.chart` (compact signal series) and
// render client-side with recharts (IodaChart.tsx). Older reports still carry the pre-recharts
// shape at `metadata.rawAPIResponse.image` — either an "ioda/charts/<sha1>.svg" storage key
// (bytes on disk under public/media) or, oldest of all, an inline SVG string. This script
// re-fetches the signal series for each such report from IODA's signals API (the same call the
// live channel makes) and rewrites the report to the JSON shape.
//
// Per-report outcomes:
//   converted  — signals came back with data -> set `chart`, delete `image`. If `image` was a
//                disk key, MOVE the .svg into a backup dir OUTSIDE the media root (so the later
//                media-bytes->Mongo backfill, which walks public/media, never re-ingests it).
//   keptAsSvg  — signals API returned nothing usable (outage too old) -> keep the SVG as the
//                fallback. If it was still an inline SVG, persist it to disk via persistSvgChart
//                so the media-bytes->Mongo migration (docs/claude/plans/media-bytes-to-mongodb.md)
//                can move it uniformly with the social images.
//   skipped    — already has `chart`, or no reconstructable rawEvent.
//   failed     — the signals fetch threw (network/5xx); left untouched, safe to re-run.
//
// Idempotent: only reports lacking `chart` are touched, so re-running resumes where it left off.
// Usage: `node scripts/backfill-ioda-svg-to-json.js [--dry-run]`

process.title = 'aggie-backfill-ioda-svg-to-json';

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const database = require('../backend/database');
const Report = require('../backend/models/report');
const { fetchSignals } = require('../backend/fetching/utils/iodaUtils');
const {
  persistSvgChart,
  getMediaRoot,
} = require('../backend/fetching/utils/socialImageStorage');

const DRY_RUN = process.argv.includes('--dry-run');

// Politeness delay between signals-API calls so a few hundred sequential fetches don't hammer IODA.
const REQUEST_DELAY_MS = Number(process.env.IODA_BACKFILL_DELAY_MS || 250);

const FOUR_HOURS = 4 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isInlineSvg(value) {
  return typeof value === 'string' && value.trimStart().startsWith('<');
}

// Mirror the window the channel uses to render the chart (ioda.js parseEvent): 4h of lead-in,
// at least a 24h span, extended to 4h past the outage end, capped at "now".
function computeWindow(rawEvent) {
  const start = Number(rawEvent.start);
  const duration = Number(rawEvent.duration);
  if (!Number.isFinite(start) || !Number.isFinite(duration)) return null;

  const end = start + duration;
  const from = start - FOUR_HOURS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const until = Math.min(Math.max(end + FOUR_HOURS, from + ONE_DAY), nowSeconds);
  return { from, until };
}

// The signals API keys off the un-stripped entity path (e.g. "geoasn/47262-IR"), which the
// channel stores verbatim as rawEvent.location. A chart is "usable" only if at least one plotted
// datasource series came back; an empty series list means IODA has no data for that old window.
function chartHasData(chart) {
  return Boolean(chart && Array.isArray(chart.series) && chart.series.length > 0);
}

// Move a converted disk SVG into a backup tree that lives OUTSIDE getMediaRoot(), preserving the
// "ioda/charts/<hash>.svg" subpath. Never deletes; a bad conversion can be restored from here.
async function backupDiskSvg(key) {
  const source = path.join(getMediaRoot(), key);
  const destination = path.join(getMediaRoot(), '..', 'ioda-charts-backup', key);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // file already moved on a prior run — fine
  }
}

async function backfill() {
  const cursor = Report.find({
    _media: 'ioda',
    'metadata.rawAPIResponse.chart': { $exists: false },
    'metadata.rawAPIResponse.image': { $exists: true, $ne: null },
  }).cursor();

  const counts = { converted: 0, keptAsSvg: 0, skipped: 0, failed: 0 };

  for (let report = await cursor.next(); report != null; report = await cursor.next()) {
    const rawApiResponse =
      report.metadata && report.metadata.rawAPIResponse
        ? report.metadata.rawAPIResponse
        : null;
    const rawEvent = rawApiResponse ? rawApiResponse.rawEvent : null;
    const image = rawApiResponse ? rawApiResponse.image : null;

    if (!rawEvent || !image) {
      counts.skipped += 1;
      continue;
    }

    const window = computeWindow(rawEvent);
    if (!window || !rawEvent.location) {
      counts.skipped += 1;
      console.warn(`Skip ${report._id} (guid=${report.guid}): no reconstructable window/location.`);
      continue;
    }

    let chart;
    try {
      chart = await fetchSignals({
        entity: rawEvent.location,
        from: window.from,
        until: window.until,
      });
    } catch (error) {
      counts.failed += 1;
      console.error(`Fetch failed ${report._id} (guid=${report.guid}, ${rawEvent.location}): ${error.message}`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    if (chartHasData(chart)) {
      const wasDiskKey = !isInlineSvg(image);
      if (!DRY_RUN) {
        report.metadata.rawAPIResponse.chart = chart;
        delete report.metadata.rawAPIResponse.image;
        report.markModified('metadata');
        await report.save();
        if (wasDiskKey) await backupDiskSvg(image);
      }
      counts.converted += 1;
    } else {
      // No usable signals — keep the SVG fallback. Promote inline SVGs onto disk so the
      // media-bytes->Mongo migration can move them uniformly with the social images.
      if (!DRY_RUN && isInlineSvg(image)) {
        const key = await persistSvgChart({ svg: image, guid: report.guid });
        if (key) {
          report.metadata.rawAPIResponse.image = key;
          report.markModified('metadata');
          await report.save();
        }
      }
      counts.keptAsSvg += 1;
    }

    const processed = counts.converted + counts.keptAsSvg;
    if (processed % 50 === 0) {
      console.log(`...processed ${processed} (converted=${counts.converted}, keptAsSvg=${counts.keptAsSvg})`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `Done${DRY_RUN ? ' (dry run — no writes)' : ''}. ` +
      `converted=${counts.converted}, keptAsSvg=${counts.keptAsSvg}, ` +
      `skipped=${counts.skipped}, failed=${counts.failed}.`
  );
  console.log(
    'Note: orphaned SVGs (files with no owning report) are neither converted nor migrated; ' +
      'they remain in public/media/ioda/charts and are ignored by the step-2 media backfill only ' +
      'if unreferenced — sweep them manually if you want the disk space back.'
  );
}

database.mongoose.connection.once('open', async () => {
  try {
    if (DRY_RUN) console.log('Dry run: fetching signals to classify reports, no DB or disk writes.');
    await backfill();
    process.exit(0);
  } catch (error) {
    console.error('Backfill aborted:', error);
    process.exit(1);
  }
});
