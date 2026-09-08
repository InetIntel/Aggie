/**
 * ONE-OFF repair: re-fetch signal series for IODA reports that render BLANK — i.e. those whose
 * `metadata.rawAPIResponse.chart` is null / missing / has an empty `series`, AND which carry no
 * legacy `image` fallback. These come from the live channel catching a transient IODA signals-API
 * error at fetch time and storing `chart = null` with no retry (backend/fetching/channels/ioda.js).
 * Because the data usually materializes shortly after the event closes, a later re-fetch succeeds.
 *
 * This is DISTINCT from backfill-ioda-charts.js:
 *   - backfill-ioda-charts.js repairs LEGACY reports that still have a scraped `ioda/charts/*.svg`
 *     image key and no `chart` field at all (chart key ABSENT).
 *   - this script repairs reports where `chart` is present-but-null / empty-series and there is NO
 *     image key — the "renders nothing" case the other backfill's filter deliberately skips.
 *
 * Idempotent: once a real series is stored, the report no longer matches the filter. Reports whose
 * re-fetch still fails/returns empty are left untouched (safe to re-run later to catch stragglers).
 * Entity + window come from the same place the live channel used: `rawEvent.location` and the
 * from/until in the stored dashboard URL.
 *
 *   node scripts/backfill/backfill-ioda-null-charts.js            # apply
 *   node scripts/backfill/backfill-ioda-null-charts.js --dry-run  # report only, no writes
 */
require('../../backend/database'); // side-effect: connects mongoose
const mongoose = require('mongoose');
const Report = require('../../backend/models/report');
const { fetchSignals } = require('../../backend/fetching/utils/iodaUtils');

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_POINTS = 150;
const BATCH = 50;

// The stored dashboard link carries the exact [from, until] window IODA showed.
function parseWindow(url) {
  try {
    const u = new URL(url);
    return { from: Number(u.searchParams.get('from')), until: Number(u.searchParams.get('until')) };
  } catch {
    return null;
  }
}

// A report "renders blank" when it has no usable chart series and no image fallback.
function needsRepair(report) {
  const raw = report.metadata && report.metadata.rawAPIResponse;
  if (!raw) return false;
  const hasImage = typeof raw.image === 'string' && raw.image.trim().length > 0;
  if (hasImage) return false; // has a fallback → not our case (and belongs to the other backfill)
  const chart = raw.chart;
  const hasSeries = chart && Array.isArray(chart.series) && chart.series.length > 0;
  return !hasSeries;
}

async function main() {
  await new Promise((res, rej) => {
    mongoose.connection.once('open', res);
    mongoose.connection.once('error', rej);
  });

  // Broad Mongo pre-filter (chart null/absent OR empty series, no image, location present);
  // needsRepair() re-checks precisely in JS so the definition stays in one place.
  const filter = {
    _media: 'ioda',
    'metadata.rawAPIResponse.rawEvent.location': { $exists: true },
    'metadata.rawAPIResponse.image': { $in: [null, ''] },
    'metadata.rawAPIResponse.chart.series.0': { $exists: false },
  };

  const total = await Report.countDocuments(filter);
  console.log(`${total} blank IODA reports (null/empty chart, no image) to repair${DRY_RUN ? ' (dry run)' : ''}.`);

  let processed = 0;
  let repaired = 0;
  let skippedNoWindow = 0;
  let skippedNoData = 0;
  let failed = 0;

  const cursor = Report.find(filter).cursor();
  for (let report = await cursor.next(); report != null; report = await cursor.next()) {
    processed += 1;

    if (!needsRepair(report)) continue; // guard against pre-filter false positives

    const raw = report.metadata.rawAPIResponse;
    const entity = raw.rawEvent && raw.rawEvent.location;
    const win = parseWindow(report.url);

    if (!entity || !win || !win.from || !win.until) {
      skippedNoWindow += 1;
      continue;
    }

    let chart;
    try {
      chart = await fetchSignals({ entity, from: win.from, until: win.until, maxPoints: MAX_POINTS });
    } catch (e) {
      // Still transient (IODA non-2xx) — leave as-is; a future run can retry.
      console.warn(`  retry-later ${report.guid} (${entity}): signals fetch failed: ${e.message}`);
      failed += 1;
      continue;
    }

    if (!chart || !chart.series.length) {
      // IODA genuinely has no series for this entity/window — nothing to store.
      skippedNoData += 1;
      continue;
    }

    if (!DRY_RUN) {
      report.metadata.rawAPIResponse.chart = chart;
      report.markModified('metadata');
      await report.save();
    }
    repaired += 1;

    if (processed % BATCH === 0) {
      console.log(`  …${processed}/${total} processed, ${repaired} repaired, ${skippedNoData} no-data, ${failed} retry-later`);
    }
  }

  console.log(
    `Done. processed=${processed} repaired=${repaired} ` +
      `skippedNoWindow=${skippedNoWindow} skippedNoData=${skippedNoData} failed=${failed}` +
      `${DRY_RUN ? ' (dry run — no writes)' : ''}`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
