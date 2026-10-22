// Stores media image bytes (social attachments + residual IODA chart SVGs) inline in MongoDB so
// media travels with the database — no separate filesystem to mount, rsync, or back up. Replaces
// the old on-disk `public/media/` store; the `key` and `/media/<key>` URL contract are unchanged.
//
// Written by the FETCH process during fetching (persistSocialImage / persistSvgChart in
// socialImageStorage.js) and read by the API process while serving GET /media/<key>. Both processes
// reach it via plain DB I/O — no cross-process event proxy is needed since this isn't a Mongoose event.

var database = require('../database');
var mongoose = database.mongoose;

var mediaAssetSchema = new mongoose.Schema(
  {
    // Same keys as the legacy disk store:
    //   "social/full/{token}.{ext}", "social/thumb/{token}.{ext}", "ioda/charts/{sha1(guid)}.svg"
    key: { type: String, required: true, unique: true },
    data: { type: Buffer, required: true }, // BSON BinData — the actual bytes
    contentType: { type: String, required: true },
    byteSize: { type: Number, required: true },
    // Lifecycle/query bucket: "social-full" | "social-thumb" | "ioda-chart"
    kind: { type: String, required: true, index: true },
    // Optional; mirrors attachment.sourcePlatform ("mastodon" / "telegramUser") for social images.
    sourcePlatform: { type: String, required: false },
  },
  // timestamps applies to updateOne(..., {upsert:true}) too in Mongoose 5.9 (sets createdAt on
  // insert, updatedAt on update) — exactly the IODA overwrite-in-place behavior we want.
  { timestamps: true }
);

var MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);

module.exports = MediaAsset;
