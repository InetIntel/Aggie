'use strict';

/**
 * Trim the `reports` collection down to (approximately) the most-recent KEEP_BYTES
 * of data, deleting everything older. Written to recover from hitting a MongoDB
 * (Atlas free tier) storage limit.
 *
 * How it works:
 *  - Reports are walked newest-first by `_id` (monotonic, never null, embeds insertion
 *    time — more reliable than `authoredAt`, which can be null/backdated for scraped
 *    content). `authoredAt` is the app's *display* sort; `_id` is the deletion order.
 *  - Each document's real BSON byte size is measured with Mongo's `$bsonSize`. We keep
 *    the newest documents until the running total reaches KEEP_BYTES, then delete
 *    everything with `_id < cutoffId`.
 *
 * A bulk `deleteMany` bypasses all Mongoose middleware/events, so side-effects are
 * handled manually:
 *  - Group back-refs: deleted `_id`s are pulled out of `group._reports` and the cached
 *    `reportsLength` is recomputed (a single aggregation-pipeline updateMany).
 *  - On-disk media (opt-in, `--purge-media`): social attachments + IODA chart SVGs
 *    referenced by the deleted reports are removed from MEDIA_ROOT. This does NOT free
 *    Mongo storage (media lives on disk), it just avoids orphaned files.
 *
 * ORDER MATTERS when over quota: Atlas blocks general writes but still permits deletes
 * so you can recover space. So we DELETE reports first (frees space), then fix group
 * back-refs. The group fix is best-effort — if it's still blocked, the deletes already
 * succeeded and you can re-run this script to clean up the refs once you're under quota.
 *
 * NOTE: `deleteMany` frees *logical* data size immediately, but WiredTiger
 * `storageSize` (what Atlas bills) is reclaimed lazily. If Atlas still shows over-limit
 * after this runs, run `db.runCommand({ compact: 'reports' })` or wait for Atlas to
 * reclaim, and see the closing log.
 *
 * SAFETY: this script does NOT delete anything unless you pass `--yes`. Without it, it
 * behaves as a dry run (also forced by `--dry-run`).
 *
 * Usage:
 *   node backend/scripts/trim-reports-to-size.js                 # dry run (safe)
 *   node backend/scripts/trim-reports-to-size.js --dry-run       # dry run (explicit)
 *   node backend/scripts/trim-reports-to-size.js --yes           # actually delete
 *   node backend/scripts/trim-reports-to-size.js --yes --purge-media
 *   KEEP_BYTES=419430400 node backend/scripts/trim-reports-to-size.js --yes
 */

require('dotenv').config();

const database = require('../database'); // connects on require
const Report = require('../models/report');
const Group = require('../models/group');
const {
  deleteMediaByKey,
  deleteSocialAttachments,
} = require('../fetching/utils/socialImageStorage');

// Amount of newest data to keep, in bytes. Default 350MB.
// NOTE: Atlas M0 free tier is a 512MB cap, so 350MB leaves some headroom. Override
// without editing code via the KEEP_BYTES env var, e.g. KEEP_BYTES=419430400 (400MB).
const KEEP_BYTES = Number(process.env.KEEP_BYTES) || 350 * 1024 * 1024;

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--yes');
const PURGE_MEDIA = process.argv.includes('--purge-media');

const LOG = '[trim-reports-to-size]';

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function collStats() {
  try {
    const s = await database.mongoose.connection.db.command({ collStats: 'reports' });
    return {
      count: s.count,
      size: s.size,
      storageSize: s.storageSize,
      avgObjSize: s.avgObjSize,
    };
  } catch (err) {
    console.warn(`${LOG} Could not read collStats: ${err.message}`);
    return null;
  }
}

function logStats(label, s) {
  if (!s) return;
  console.log(
    `${LOG} ${label}: count=${s.count}, data=${fmtBytes(s.size)}, ` +
      `storage=${fmtBytes(s.storageSize)}, avgObj=${fmtBytes(s.avgObjSize || 0)}`
  );
}

// Walk reports newest-first, summing real BSON size, and return the cutoff:
// the oldest `_id` we keep. Everything with `_id < cutoffId` should be deleted.
async function findCutoff() {
  const cursor = Report.collection.aggregate(
    [
      { $sort: { _id: -1 } },
      { $project: { _size: { $bsonSize: '$$ROOT' } } },
    ],
    { allowDiskUse: true }
  );

  let running = 0;
  let keptCount = 0;
  let cutoffId = null;

  for await (const doc of cursor) {
    // Always keep at least the newest doc; keep adding until we reach the budget.
    running += doc._size;
    cutoffId = doc._id;
    keptCount += 1;
    if (running >= KEEP_BYTES) break;
  }

  return { cutoffId, keptCount, keptBytes: running };
}

async function purgeMediaFor(cutoffId) {
  console.log(`${LOG} Purging on-disk media for reports to be deleted...`);
  const cursor = Report.collection.find(
    { _id: { $lt: cutoffId } },
    { projection: { 'metadata.attachments': 1, 'metadata.rawAPIResponse.image': 1 } }
  );

  let files = 0;
  for await (const doc of cursor) {
    const meta = doc.metadata || {};
    if (Array.isArray(meta.attachments) && meta.attachments.length) {
      await deleteSocialAttachments(meta.attachments);
      files += meta.attachments.length * 2; // image + thumb
    }
    const iodaImage = meta.rawAPIResponse && meta.rawAPIResponse.image;
    // Only a stored media key — skip remote URLs and legacy inline SVG strings.
    if (
      typeof iodaImage === 'string' &&
      !/^https?:\/\//i.test(iodaImage) &&
      !iodaImage.includes('<svg')
    ) {
      await deleteMediaByKey(iodaImage);
      files += 1;
    }
  }
  console.log(`${LOG} Media purge complete (~${files} file operations).`);
}

async function main() {
  console.log(
    `${LOG} Target keep size: ${fmtBytes(KEEP_BYTES)}. Mode: ${
      DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (--yes)'
    }${PURGE_MEDIA ? ' +purge-media' : ''}.`
  );

  const before = await collStats();
  logStats('Before', before);

  const total = await Report.countDocuments({});
  const { cutoffId, keptCount, keptBytes } = await findCutoff();

  if (!cutoffId) {
    console.log(`${LOG} Collection is empty — nothing to do.`);
    return;
  }

  const toDelete = await Report.countDocuments({ _id: { $lt: cutoffId } });
  const cutoffDate = cutoffId.getTimestamp();
  const groupsToTouch = await Group.countDocuments({ _reports: { $lt: cutoffId } });

  console.log(
    `${LOG} Of ${total} reports: keeping ${keptCount} newest (~${fmtBytes(
      keptBytes
    )}), deleting ${toDelete}.`
  );
  console.log(
    `${LOG} Cutoff _id=${cutoffId} (created ${cutoffDate.toISOString()}); ` +
      `reports older than this are deleted.`
  );
  console.log(`${LOG} Groups with deleted-report refs to fix: ${groupsToTouch}.`);

  if (toDelete === 0) {
    console.log(`${LOG} Nothing older than the cutoff — collection already within budget.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`${LOG} Dry run — no writes performed. Re-run with --yes to delete.`);
    return;
  }

  // 1. On-disk media (opt-in) — do this BEFORE deleting docs so we can still read refs.
  if (PURGE_MEDIA) {
    await purgeMediaFor(cutoffId);
  }

  // 2. Delete the old reports FIRST. Atlas blocks general writes when over quota but
  //    still permits deletes, so this is the operation that actually frees space.
  const delResult = await Report.deleteMany({ _id: { $lt: cutoffId } });
  console.log(`${LOG} Deleted reports: ${delResult.deletedCount ?? delResult.n}.`);

  // 3. Fix Group back-refs: drop deleted ids from _reports and recompute reportsLength,
  //    atomically, only on affected groups (aggregation-pipeline update, Mongo 4.2+).
  //    Best-effort: this is a general write, so if we're still over quota it may be
  //    blocked — the deletes above already succeeded, so just re-run once under quota.
  try {
    const groupResult = await Group.updateMany({ _reports: { $lt: cutoffId } }, [
      {
        $set: {
          _reports: {
            $filter: {
              input: '$_reports',
              as: 'r',
              cond: { $gte: ['$$r', cutoffId] },
            },
          },
        },
      },
      { $set: { reportsLength: { $size: '$_reports' } } },
    ]);
    console.log(
      `${LOG} Updated groups: ${groupResult.nModified ?? groupResult.modifiedCount}.`
    );
  } catch (err) {
    console.warn(
      `${LOG} Group back-ref cleanup failed (${err.message}). Reports were still ` +
        `deleted. Re-run this script once you are back under quota to fix ${groupsToTouch} group(s).`
    );
  }

  const after = await collStats();
  logStats('After', after);

  console.log(
    `${LOG} Done. Logical data size dropped; if Atlas still reports over-limit, ` +
      `storageSize is reclaimed lazily — run db.runCommand({ compact: 'reports' }) ` +
      `or wait for Atlas to reclaim.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`${LOG} Failed - ${err.stack || err.message}`);
    process.exit(1);
  });
