'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const MEDIA_ROUTE_PREFIX = '/media';
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
  console.log('debugging-getMediaRoot: ',MEDIA_ROOT);
  return MEDIA_ROOT;
}

function buildMediaUrl(key) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return null;
  return `${MEDIA_ROUTE_PREFIX}/${normalizedKey}`;
}

function resolveMediaPath(key) {
  return path.join(MEDIA_ROOT, normalizeKey(key));
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

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function createThumbnail(sourcePath, destinationPath) {
  await ensureParentDir(destinationPath);
  try {
    await execFileAsync('/usr/bin/sips', [
      '-Z',
      String(THUMBNAIL_MAX_SIZE),
      sourcePath,
      '--out',
      destinationPath,
    ]);
  } catch (_) {
    await fs.copyFile(sourcePath, destinationPath);
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
  const fullPath = resolveMediaPath(fullKey);
  const thumbnailPath = resolveMediaPath(thumbnailKey);
  const tempSourcePath = path.join(os.tmpdir(), `aggie-social-${token}.${extension}`);

  await ensureParentDir(fullPath);

  try {
    await fs.writeFile(fullPath, buffer);
    await fs.writeFile(tempSourcePath, buffer);
    await createThumbnail(tempSourcePath, thumbnailPath);

    return {
      type: 'image',
      imageKey: fullKey,
      thumbnailKey,
      mimeType: detectedMimeType,
      sourcePlatform: sourcePlatform || null,
    };
  } catch (error) {
    await Promise.allSettled([
      fs.unlink(fullPath),
      fs.unlink(thumbnailPath),
      fs.unlink(tempSourcePath),
    ]);
    throw error;
  } finally {
    await fs.unlink(tempSourcePath).catch(() => {});
  }
}

async function deleteMediaByKey(key) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return;

  await fs.unlink(resolveMediaPath(normalizedKey)).catch((error) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
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
  deleteSocialAttachments,
  detectImageMimeType,
  getMediaRoot,
  persistSocialImage,
};
