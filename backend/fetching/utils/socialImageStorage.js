'use strict';

const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');

const MediaAsset = require('../../models/mediaAsset');

const MEDIA_ROUTE_PREFIX = '/media';
// When deployed under a subpath (APP_BASE_PATH, e.g. "/aggie"), browser-facing media
// URLs must include it — nginx only routes <base>/* to the node app, so a bare
// "/media/..." resolves to the domain root and returns the SPA instead of the file.
// Empty at the domain root and in dev.
const APP_BASE_PATH = (process.env.APP_BASE_PATH || '').replace(/\/+$/, '');
// Bytes now live in the `mediaassets` Mongo collection, not on disk. MEDIA_ROOT is retained only
// so the one-time backfill (backfillMediaToMongo.js) can walk the legacy disk tree; nothing in the
// live read/write path touches the filesystem anymore.
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(__dirname, '../../../public/media');
const THUMBNAIL_MAX_SIZE = Number(process.env.SOCIAL_IMAGE_THUMB_SIZE || 320);

function normalizeKey(key) {
  return path.posix
    .normalize(
      String(key || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
    )
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function getMediaRoot() {
  return MEDIA_ROOT;
}

function buildMediaUrl(key) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return null;
  return `${APP_BASE_PATH}${MEDIA_ROUTE_PREFIX}/${normalizedKey}`;
}

function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  if (
    buffer.slice(0, 6).toString('ascii') === 'GIF87a' ||
    buffer.slice(0, 6).toString('ascii') === 'GIF89a'
  ) {
    return 'image/gif';
  }

  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

function extensionForMimeType(mimeType) {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
}

async function persistSocialImage({ buffer, sourcePlatform, mimeType }) {
  const detectedMimeType = mimeType || detectImageMimeType(buffer);

  if (!detectedMimeType || !detectedMimeType.startsWith('image/')) {
    throw new Error('Unsupported social image mime type.');
  }

  const extension = extensionForMimeType(detectedMimeType);
  const token = crypto.randomBytes(16).toString('hex');
  const fullKey = `social/full/${token}.${extension}`;
  const thumbnailKey = `social/thumb/${token}.${extension}`;

  // Real ~320px thumbnail generated in-memory. `toBuffer` preserves the input format, so the
  // thumbnail keeps the same extension/content-type as the full image. Replaces the macOS-only
  // `sips` shell-out, which silently produced a full-size copy on the Ubuntu prod VM.
  const thumbnailBuffer = await sharp(buffer)
    .resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();

  await MediaAsset.create([
    {
      key: fullKey,
      data: buffer,
      contentType: detectedMimeType,
      byteSize: buffer.length,
      kind: 'social-full',
      sourcePlatform: sourcePlatform || null,
    },
    {
      key: thumbnailKey,
      data: thumbnailBuffer,
      contentType: detectedMimeType,
      byteSize: thumbnailBuffer.length,
      kind: 'social-thumb',
      sourcePlatform: sourcePlatform || null,
    },
  ]);

  return {
    type: 'image',
    imageKey: fullKey,
    thumbnailKey,
    mimeType: detectedMimeType,
    sourcePlatform: sourcePlatform || null,
  };
}

// Retained for the one-off IODA SVG backfill (`scripts/backfill-ioda-svg-to-json.js`), which
// promotes leftover inline chart SVGs into stored assets so they render via the `image` fallback.
// The live IODA channel no longer calls this — new reports store signal JSON
// (`metadata.rawAPIResponse.chart`) and render with recharts (IodaChart.tsx).
async function persistSvgChart({ svg, guid }) {
  if (!svg || typeof svg !== 'string' || !guid) return null;

  // Deterministic key per event (keyed by guid) so a re-fetch overwrites the same doc in place
  // instead of orphaning a new one.
  const hash = crypto.createHash('sha1').update(String(guid)).digest('hex');
  const key = `ioda/charts/${hash}.svg`;
  const data = Buffer.from(svg, 'utf-8');

  await MediaAsset.updateOne(
    { key },
    {
      $set: {
        data,
        contentType: 'image/svg+xml',
        kind: 'ioda-chart',
        byteSize: data.length,
      },
    },
    { upsert: true }
  );

  return key; // stored in place of the inline SVG string
}

async function deleteMediaByKey(key) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return;

  await MediaAsset.deleteOne({ key: normalizedKey });
}

async function deleteSocialAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return;

  const keys = attachments.flatMap((attachment) => [
    attachment?.imageKey,
    attachment?.thumbnailKey,
  ]);

  await Promise.all(keys.map((key) => deleteMediaByKey(key)));
}

module.exports = {
  MEDIA_ROUTE_PREFIX,
  buildMediaUrl,
  deleteMediaByKey,
  deleteSocialAttachments,
  detectImageMimeType,
  getMediaRoot,
  normalizeKey,
  persistSocialImage,
  persistSvgChart,
};
