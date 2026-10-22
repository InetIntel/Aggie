'use strict';

/**
 * One-time backfill: move legacy media bytes from disk (`public/media/`) into the `mediaassets`
 * Mongo collection, so media travels with the DB.
 *
 * REFERENCE-AWARE — migrates only the keys a report actually points at. A naive file-driven walk
 * would ingest *orphans* (files whose reports were pruned) as dead weight; after the IODA SVG→JSON
 * backfill the entire `ioda/charts/` subtree is orphaned on dev (~322 MB), and we do NOT want that
 * in Mongo. So the migration set is built from referenced keys, and unreferenced files are only
 * counted and reported, never ingested.
 *
 * Referenced keys:
 *   - social:  metadata.attachments[].imageKey / .thumbnailKey
 *   - ioda:    metadata.rawAPIResponse.image (residual un-convertible SVGs; empty on dev post-Step-1)
 *
 * Idempotent (updateOne upsert per key). Leaves disk files in place until verified.
 * Usage: node backend/scripts/backfillMediaToMongo.js [--dry-run]
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs').promises;

const database = require('../database'); // connects on require
const Report = require('../models/report');
const MediaAsset = require('../models/mediaAsset');
const {
  getMediaRoot,
  normalizeKey,
  detectImageMimeType,
} = require('../fetching/utils/socialImageStorage');

const DRY_RUN = process.argv.includes('--dry-run');

// The disk subtrees this migration owns. Anything else under MEDIA_ROOT is left alone; the
// out-of-media `ioda-charts-backup` tree (rollback copies from the SVG→JSON backfill) is not
// under MEDIA_ROOT and is therefore never seen.
const MANAGED_SUBTREES = ['social/full', 'social/thumb', 'ioda/charts'];

function isStorageKey(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trimStart();
  if (!trimmed) return false;
  if (trimmed.startsWith('<')) return false; // inline SVG string, not a key
  if (/^https?:\/\//i.test(trimmed)) return false; // absolute remote URL (e.g. Cloudflare Radar)
  return true;
}

function kindForKey(key) {
  if (key.startsWith('social/full/')) return 'social-full';
  if (key.startsWith('social/thumb/')) return 'social-thumb';
  if (key.startsWith('ioda/charts/')) return 'ioda-chart';
  return null;
}

function contentTypeForKey(key, buffer) {
  if (key.endsWith('.svg')) return 'image/svg+xml';
  return detectImageMimeType(buffer) || 'application/octet-stream';
}

// All keys a report references, normalized and de-duplicated.
async function collectReferencedKeys() {
  const keys = new Set();

  const [imageKeys, thumbnailKeys, iodaImages] = await Promise.all([
    Report.distinct('metadata.attachments.imageKey'),
    Report.distinct('metadata.attachments.thumbnailKey'),
    Report.distinct('metadata.rawAPIResponse.image', {
      _media: 'ioda',
      'metadata.rawAPIResponse.image': { $type: 'string' },
    }),
  ]);

  for (const value of [...imageKeys, ...thumbnailKeys]) {
    if (isStorageKey(value)) keys.add(normalizeKey(value));
  }
  for (const value of iodaImages) {
    if (isStorageKey(value)) keys.add(normalizeKey(value));
  }

  return keys;
}

// Recursively list files under a managed subtree, returning their normalized storage keys.
async function listSubtreeKeys(subtree) {
  const absoluteRoot = path.join(getMediaRoot(), subtree);
  let entries;
  try {
    entries = await fs.readdir(absoluteRoot, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return []; // subtree doesn't exist on this instance
    throw error;
  }
  const keys = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // entry.parentPath (Node 20+) is the absolute dir; build the key relative to MEDIA_ROOT.
    const absoluteFile = path.join(entry.parentPath || absoluteRoot, entry.name);
    const relative = path.relative(getMediaRoot(), absoluteFile);
    keys.push(normalizeKey(relative.split(path.sep).join('/')));
  }
  return keys;
}

async function migrateKey(key) {
  const kind = kindForKey(key);
  if (!kind) return { status: 'skipped' };

  const filePath = path.join(getMediaRoot(), key);
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'dangling' };
    throw error;
  }

  if (!DRY_RUN) {
    await MediaAsset.updateOne(
      { key },
      {
        $set: {
          data: buffer,
          contentType: contentTypeForKey(key, buffer),
          byteSize: buffer.length,
          kind,
          // sourcePlatform isn't recoverable from the key alone; live writes set it going forward.
        },
      },
      { upsert: true }
    );
  }

  return { status: 'migrated', bytes: buffer.length };
}

async function main() {
  const referenced = await collectReferencedKeys();
  console.log(
    `[backfillMediaToMongo]${DRY_RUN ? ' (dry run)' : ''} ${referenced.size} referenced media keys.`
  );

  let migrated = 0;
  let migratedBytes = 0;
  let dangling = 0;
  const danglingKeys = [];

  for (const key of referenced) {
    const result = await migrateKey(key);
    if (result.status === 'migrated') {
      migrated += 1;
      migratedBytes += result.bytes;
    } else if (result.status === 'dangling') {
      dangling += 1;
      danglingKeys.push(key);
    }
  }

  // Count unreferenced files still on disk so the operator can sweep/back-up separately — never
  // ingest them. Move them to a backup dir rather than unlink (back-up, don't delete).
  let orphaned = 0;
  let orphanedBytes = 0;
  for (const subtree of MANAGED_SUBTREES) {
    const keys = await listSubtreeKeys(subtree);
    for (const key of keys) {
      if (referenced.has(key)) continue;
      orphaned += 1;
      try {
        const { size } = await fs.stat(path.join(getMediaRoot(), key));
        orphanedBytes += size;
      } catch (_) {
        /* file vanished mid-walk — ignore */
      }
    }
  }

  const mib = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
  console.log(
    `[backfillMediaToMongo] Done${DRY_RUN ? ' (dry run — no writes)' : ''}. ` +
      `migrated=${migrated} (${mib(migratedBytes)} MiB), ` +
      `dangling=${dangling} (referenced but missing on disk), ` +
      `orphaned=${orphaned} (${mib(orphanedBytes)} MiB, on disk but unreferenced — NOT migrated).`
  );
  if (dangling > 0) {
    console.log('[backfillMediaToMongo] Dangling keys:', danglingKeys.slice(0, 20).join(', ') + (dangling > 20 ? ' …' : ''));
  }
}

database.mongoose.connection.once('open', async () => {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error('[backfillMediaToMongo] Aborted:', error);
    process.exit(1);
  }
});
