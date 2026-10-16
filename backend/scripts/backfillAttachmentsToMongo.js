'use strict';

/**
 * One-time backfill: move legacy incident comment attachment bytes from disk (`public/uploads/`)
 * into the `mediaassets` Mongo collection (kind 'incident-attachment'), so attachments travel
 * with the database. Modeled on backfillMediaToMongo.js.
 *
 * REFERENCE-AWARE — migrates only the files a comment actually points at (serverPath).
 * Unreferenced files under the upload dir (orphans) are counted and reported, never ingested
 * and never deleted — left alone for the operator to sweep separately.
 *
 * Re-runnable: attachments that already have a storageKey (and no serverPath) are skipped, and
 * the MediaAsset upsert is keyed on the content hash, so re-running changes nothing. Attachments
 * whose file is missing on disk are reported as dangling and left untouched.
 *
 * Dry-run by default — nothing is written unless --apply is passed.
 * Usage: node backend/scripts/backfillAttachmentsToMongo.js [--apply]
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs').promises;

const database = require('../database'); // connects on require
const Group = require('../models/group');
const MediaAsset = require('../models/mediaAsset');
const { saveFile } = require('../api/utils/fileStorage');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

// Legacy disk location — mirrors the old fileStorage.js default (UPLOAD_DIR env, else
// <checkout>/public/uploads). Kept here only so the backfill can walk the old tree; nothing in
// the live read/write path touches the filesystem anymore.
const LEGACY_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads');

// All comment attachments still pointing at disk: { groupId, commentId, attachmentId, serverPath, fileName }.
async function collectLegacyAttachments() {
  const groups = await Group.find(
    { 'comments.attachments.serverPath': { $exists: true } },
    { 'comments.attachments': 1 }
  ).lean();

  const items = [];
  for (const group of groups) {
    for (const comment of group.comments || []) {
      for (const attachment of comment.attachments || []) {
        if (attachment.serverPath) {
          items.push({
            groupId: group._id,
            commentId: comment._id,
            attachmentId: attachment._id,
            serverPath: attachment.serverPath,
            fileName: attachment.fileName,
          });
        }
      }
    }
  }
  return items;
}

// Attachments already migrated (have a storageKey), for the re-run report.
async function countMigratedAttachments() {
  const result = await Group.aggregate([
    { $unwind: '$comments' },
    { $unwind: '$comments.attachments' },
    { $match: { 'comments.attachments.storageKey': { $exists: true } } },
    { $count: 'n' },
  ]);
  return result.length ? result[0].n : 0;
}

async function migrateAttachment(item) {
  let buffer;
  try {
    buffer = await fs.readFile(item.serverPath);
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'dangling' };
    throw error;
  }

  if (!DRY_RUN) {
    // saveFile computes the content-addressed key (incidents/attachments/{sha256}.{ext}) and
    // upserts the bytes into `mediaassets` (kind 'incident-attachment').
    const storageKey = await saveFile(buffer, item.fileName);
    await Group.updateOne(
      { _id: item.groupId },
      {
        $set: { 'comments.$[comment].attachments.$[attachment].storageKey': storageKey },
        $unset: { 'comments.$[comment].attachments.$[attachment].serverPath': '' },
      },
      {
        arrayFilters: [
          { 'comment._id': item.commentId },
          { 'attachment._id': item.attachmentId },
        ],
      }
    );
  }

  return { status: 'migrated', bytes: buffer.length };
}

// Recursively list files under the legacy upload dir, returning absolute paths.
async function listLegacyFiles(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return []; // dir doesn't exist on this instance
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listLegacyFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

async function main() {
  const legacy = await collectLegacyAttachments();
  const alreadyMigrated = await countMigratedAttachments();
  console.log(
    `[backfillAttachmentsToMongo]${DRY_RUN ? ' (dry run — pass --apply to write)' : ''} ` +
      `${legacy.length} attachments still on disk, ${alreadyMigrated} already in MongoDB.`
  );

  let migrated = 0;
  let migratedBytes = 0;
  let dangling = 0;
  const danglingPaths = [];

  for (const item of legacy) {
    const result = await migrateAttachment(item);
    if (result.status === 'migrated') {
      migrated += 1;
      migratedBytes += result.bytes;
    } else if (result.status === 'dangling') {
      dangling += 1;
      if (danglingPaths.length < 20) danglingPaths.push(item.serverPath);
    }
  }

  // Orphaned files: on disk but referenced by no attachment. Counted and reported only —
  // never ingested, never deleted.
  const referencedPaths = new Set(legacy.map((item) => path.resolve(item.serverPath)));
  let orphaned = 0;
  let orphanedBytes = 0;
  for (const absolute of await listLegacyFiles(LEGACY_UPLOAD_DIR)) {
    if (referencedPaths.has(path.resolve(absolute))) continue;
    orphaned += 1;
    try {
      const { size } = await fs.stat(absolute);
      orphanedBytes += size;
    } catch (_) {
      /* file vanished mid-walk — ignore */
    }
  }

  const mib = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
  console.log(
    `[backfillAttachmentsToMongo] Done${DRY_RUN ? ' (dry run — no writes)' : ''}. ` +
      `migrated=${migrated} (${mib(migratedBytes)} MiB), ` +
      `dangling=${dangling} (referenced but missing on disk), ` +
      `orphaned=${orphaned} (${mib(orphanedBytes)} MiB, on disk but unreferenced — NOT migrated, NOT deleted).`
  );
  if (dangling > 0) {
    console.log(
      '[backfillAttachmentsToMongo] Dangling paths:',
      danglingPaths.join(', ') + (dangling > 20 ? ' …' : '')
    );
  }
  if (DRY_RUN) {
    console.log('[backfillAttachmentsToMongo] Re-run with --apply to perform the migration.');
  }
}

database.mongoose.connection.once('open', async () => {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error('[backfillAttachmentsToMongo] Aborted:', error);
    process.exit(1);
  }
});
