// Incident comment attachment storage. Bytes live in the `mediaassets` Mongo collection
// (kind 'incident-attachment') so they travel with the database — no request handler writes to
// `public/uploads` or any other local folder. This replaced the old disk store
// (`<timestamp>_<filename>` under `public/uploads`), which left attachments behind whenever the
// database moved to another checkout. See docs/claude/architecture/media-image-storage.md.
'use strict';

const crypto = require('crypto');
const path = require('path');

const MediaAsset = require('../../models/mediaAsset');

// Content-addressed keys: uploading the same file twice stores the bytes once.
const ATTACHMENT_KEY_PREFIX = 'incidents/attachments';

function sanitizeExtension(originalname) {
  const ext = path
    .extname(String(originalname || ''))
    .toLowerCase()
    .replace(/^\./, '');
  // Keep the extension short and filename-safe; fall back to 'bin' when there is none.
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
}

function storageKeyFor(fileBuffer, originalname) {
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  return `${ATTACHMENT_KEY_PREFIX}/${hash}.${sanitizeExtension(originalname)}`;
}

function detectContentType(fileBuffer, originalname) {
  if (Buffer.isBuffer(fileBuffer) && fileBuffer.length >= 5) {
    if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (
      fileBuffer[0] === 0x89 &&
      fileBuffer[1] === 0x50 &&
      fileBuffer[2] === 0x4e &&
      fileBuffer[3] === 0x47
    ) {
      return 'image/png';
    }
    if (fileBuffer.slice(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
  }
  switch (path.extname(String(originalname || '')).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.pdf':
      return 'application/pdf';
    case '.csv':
      return 'text/csv';
    case '.txt':
    case '.text':
    case '.log':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

// Stores the bytes in MongoDB (upserted by content hash) and returns the storage key.
// Same signature as the old disk store, so the call sites in groupController.js are unchanged.
async function saveFile(fileBuffer, originalname) {
  const key = storageKeyFor(fileBuffer, originalname);
  await MediaAsset.updateOne(
    { key },
    {
      $set: {
        data: fileBuffer,
        contentType: detectContentType(fileBuffer, originalname),
        byteSize: fileBuffer.length,
        kind: 'incident-attachment',
      },
    },
    { upsert: true }
  );
  return key;
}

// Deletes the bytes for a storage key. No-op when the key is missing or unknown.
async function deleteFile(key) {
  if (!key) return;
  await MediaAsset.deleteOne({ key });
}

module.exports = {
  saveFile,
  deleteFile,
};
