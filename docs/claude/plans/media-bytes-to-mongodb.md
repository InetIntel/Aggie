# Plan: Migrate media bytes from `public/media/` into a MongoDB collection

> **Scope note (IODA partially in scope):** New IODA reports store compact **signal JSON inline on
> the report** and render with recharts (see `ioda-signals-json-to-recharts.md`, implemented).
> **Step 1 below** backfills that JSON onto *legacy* reports by re-fetching signals; whatever IODA
> can no longer serve keeps its scraped SVG as a fallback. So the bytes this migration moves are
> **social images (Mastodon/Telegram)** plus the **small residual set of un-convertible IODA SVGs**
> — not the full ~427 MB of chart SVGs, which Step 1 converts to ~KB-sized JSON on the reports.

## Step 1 — prerequisite: backfill legacy IODA SVGs to JSON

Run **`scripts/backfill-ioda-svg-to-json.js`** *before* the media-bytes migration below. It walks
legacy IODA reports (`metadata.rawAPIResponse.image` present, no `chart`), reconstructs the signals
window from `rawEvent.location/start/duration`, and re-fetches the series via `fetchSignals` (the
same call the live channel makes — an SVG is a rendered picture and can't be decoded back to data,
so the real series must come from IODA's API).

- **Converted** (signals returned data): sets `metadata.rawAPIResponse.chart`, deletes `.image`, and
  **moves** the disk SVG into `../ioda-charts-backup` (a dir **outside `MEDIA_ROOT`**, so the media
  backfill below never re-ingests it). Never deletes — bad conversions are restorable.
- **Kept as SVG** (IODA has no data for that old window): the report keeps its SVG fallback; an
  inline SVG is promoted onto disk (`persistSvgChart`) so it migrates uniformly in Step 2.
- **`--dry-run`** classifies every report (`converted / keptAsSvg / skipped / failed`) without
  writing, so you know the residual SVG count — and thus the Step-2 collection size — up front.

**Sizing (measured on dev `aggie`):** 545 IODA reports, ~461 convertible; each `chart` JSON averages
~6.7 KB, so Step 1 adds only ~3 MB to `reports` while moving ~427 MB of SVG off disk. The
`mediaassets` collection therefore holds only the residual un-convertible IODA SVGs + social images
— **not** 427 MB.

**Frontend:** no change. `src/components/SocialMediaPost/IodaEvent.tsx` already renders all three
shapes — recharts when `chart.series` exists, else an inline SVG, else a `/media` `<img>` via
`resolveMediaUrl` — so converted and kept-as-SVG reports both render correctly.

## Step 2 — move remaining media bytes into MongoDB

> Everything below covers Step 2. It assumes Step 1 has run, so the only local bytes left under
> `public/media/` are social images plus the residual un-convertible `ioda/charts/*.svg` files. The
> one-time backfill (`backfillMediaToMongo.js`) walks `getMediaRoot()`'s subtrees; the
> `ioda-charts-backup` dir is outside `MEDIA_ROOT` and is therefore skipped automatically.

## Context

Image bytes for **Mastodon**, **Telegram (user)**, and **residual IODA charts** (the un-convertible
SVGs left after Step 1) currently live on the VM's local filesystem under `public/media/`
(overridable via `MEDIA_ROOT`) and are served **unauthenticated** as static files at
`GET /media/<key>`. MongoDB stores only small **string keys**, never bytes. This makes media
non-portable: sharing the DB doesn't share the images, so QA and prod each need their own disk,
mounted and backed up separately, and image durability is tied to the VM disk instead of the database.

**Goal:** store the bytes **in MongoDB** so media travels with the database — no separate
filesystem to mount, rsync, or back up. Twitter/Instagram/Facebook (Junkipedia) and Cloudflare
are unaffected (they only ever store a remote URL, never local bytes).

The whole design hinges on **preserving the exact same keys and the `/media/<key>` URL
contract**, so the change surface is tiny: only *where bytes are written/read/deleted*
(`socialImageStorage.js`) and *how `/media` is served* (`api.js`) change. Reports, controllers,
channels, hooks, and the entire frontend are untouched.

**Decisions confirmed with the user:**
- **Storage engine:** single collection `mediaassets` with inline `BinData` (`Buffer`) — not
  GridFS. Files are small (SVGs tiny, social images well under the 16MB BSON cap).
- **One flat collection** — Mastodon, Telegram, and IODA all write top-level docs into the same
  `mediaassets` collection; sources are distinguished by the `key` prefix, `kind`, and optional
  `sourcePlatform` fields, not by separate collections.
- **Thumbnails:** replace the macOS-only `sips` shell-out with in-memory **`sharp`**. `sips`
  doesn't exist on the Ubuntu prod VM, so prod thumbnails are currently silent full-size copies
  (a latent bug) — this migration fixes it with real ~320px thumbnails.
- **Serving auth:** keep `/media/<key>` **unauthenticated**, exactly as today. Zero frontend
  changes. (Auth is a separate future hardening task.)
- **Existing files:** **backfill** the *referenced* bytes currently in `public/media/` into Mongo
  via a one-time script (see the reference-aware rule in §4), then retire the folder afterward.
- **Orphans:** files on disk that **no report references** (e.g. IODA chart SVGs whose reports were
  pruned) are **not** migrated — they'd be dead weight in Mongo. After Step 1's IODA→JSON backfill,
  everything left in `ioda/charts/` on dev is orphaned; the backfill must skip these, not ingest them.

## Data model — `backend/models/mediaAsset.js` (new), collection `mediaassets`

```js
{
  key:            String,   // UNIQUE index. Same keys as today:
                            //   "social/full/{token}.{ext}", "social/thumb/{token}.{ext}",
                            //   "ioda/charts/{sha1(guid)}.svg"
  data:           Buffer,   // BSON BinData — the actual bytes
  contentType:    String,   // "image/jpeg"|"image/png"|"image/gif"|"image/webp"|"image/svg+xml"
  byteSize:       Number,
  kind:           String,   // "social-full" | "social-thumb" | "ioda-chart"  (lifecycle queries)
  sourcePlatform: String,   // optional; mirrors attachment.sourcePlatform ("mastodon"/"telegramUser")
  createdAt:      Date,     // via timestamps
  updatedAt:      Date,
}
```

**Match existing model conventions** (verified against `report.js`, `source.js`, `tag.js`):
- `const database = require('../database'); const mongoose = database.mongoose;`
- Define `new mongoose.Schema({...}, { timestamps: true })`. Mongoose 5.9 applies `timestamps`
  to `updateOne(..., {upsert:true})` too (sets `createdAt` on insert, `updatedAt` on update) —
  which is exactly the IODA overwrite-in-place behavior we want. (Other models hand-roll
  timestamps; a fresh model can use the built-in option cleanly.)
- `key`: `{ type: String, required: true, unique: true }` (inline unique index — global
  `useCreateIndex: true` is already set in `database.js`). Add `kind: { ..., index: true }`.
- Export: `const MediaAsset = mongoose.model('MediaAsset', schema); module.exports = MediaAsset;`

The model lives in `backend/models/` so **both** the FETCH process (writes during fetching) and
the API process (reads while serving) reach it via plain DB I/O — no cross-process event proxy
needed (this isn't a Mongoose event, and both processes already connect via `require('../database')`).

**Write semantics:** social images are write-once → `insertOne` (two docs: full + thumb).
IODA charts are deterministic per `guid` and re-fetched during ongoing outages →
`updateOne({key}, ..., {upsert:true})` to preserve overwrite-in-place.

## Changes

### 1. `backend/fetching/utils/socialImageStorage.js` — core rewrite, same public API

Keep every exported signature identical so all callers stay untouched (verified call sites:
`mastodon.js:354`, `telegramUser.js:649`, `ioda.js:639`, `reportController.js:15/62/64/83`,
`saveToDatabase.js:4`). Specifically:

- **Add `normalizeKey` to the exports** — it's currently an internal helper (exports at
  `socialImageStorage.js:193-202`) but the new `api.js` route needs it.
- `persistSocialImage({ buffer, sourcePlatform, mimeType })` — unchanged return shape
  `{ type, imageKey, thumbnailKey, mimeType, sourcePlatform }`. Internally:
  - detect mime (`detectImageMimeType`) and generate the same random-token keys
    (`extensionForMimeType` stays),
  - build the thumbnail **in-memory with `sharp`**:
    `sharp(buffer).resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, { fit: 'inside', withoutEnlargement: true }).toBuffer()`
    — replaces `createThumbnail`/`sips`/tmpdir entirely,
  - `insertOne` a `mediaassets` doc for `social/full/...` (`kind:'social-full'`) and one for
    `social/thumb/...` (`kind:'social-thumb'`), each with `data`, `contentType`, `byteSize`,
    `sourcePlatform`.
- `persistSvgChart({ svg, guid })` — unchanged return (bare key string). Compute `sha1(guid)`
  key, `updateOne({key}, {$set:{data, contentType:'image/svg+xml', kind:'ioda-chart', byteSize}}, {upsert:true})`.
- `deleteMediaByKey(key)` → `deleteOne({ key })`. `deleteSocialAttachments` unchanged.
- `buildMediaUrl(key)` and `normalizeKey` **unchanged** — still emit `${APP_BASE_PATH}/media/<key>`
  (subpath handling preserved).
- Remove `createThumbnail`, `resolveMediaPath`, `ensureParentDir`, and the `os`/`execFile`/
  `fs`-write imports. **Keep `getMediaRoot` (and `MEDIA_ROOT`)** — the backfill script still
  needs it to walk the disk tree — but **delete the stray `console.log` at line 34**. Drop only
  the `getMediaRoot` *import in `api.js`*; remove `getMediaRoot` itself in a later cleanup once
  `public/media/` is deleted.

### 2. `backend/api.js` — replace both `express.static` mounts with a streaming route

Replace the dev mount (`api.js:98-100`) and the prod mount (`api.js:190-192`) — both currently
`app.use('/media', express.static(getMediaRoot()))` — with one handler at the same path. Drop
the `getMediaRoot` import (`api.js:21`); import `normalizeKey` and the `MediaAsset` model instead.

```js
app.get('/media/*', async (req, res) => {
  const key = normalizeKey(req.params[0]);
  const asset = await MediaAsset.findOne({ key }).lean();   // .lean() returns the raw Buffer
  if (!asset) return res.sendStatus(404);
  // social/* keys are random/content-addressed and never mutated → cache hard & immutable.
  // ioda-chart overwrites in place → revalidate, and key the ETag on updatedAt so a re-fetch busts it.
  const isImmutable = asset.kind !== 'ioda-chart';
  const etag = isImmutable ? asset.key : `${asset.key}:${asset.updatedAt.getTime()}`;
  res.set('Content-Type', asset.contentType);
  res.set('Cache-Control', isImmutable
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, must-revalidate');
  res.set('ETag', etag);
  if (req.headers['if-none-match'] === etag) return res.sendStatus(304);
  res.send(asset.data);   // Buffer
});
```

- Keep it mounted **before** the auth-gated `/api` (currently `api.js:171`), preserving today's
  unauthenticated access in both dev and prod.

### 3. `backend/models/mediaAsset.js` — new model (schema/conventions above).

### 4. `backend/scripts/backfillMediaToMongo.js` — one-time, idempotent, re-runnable

Follow the existing script bootstrap (verified in `backfill-outage-ongoing.js`,
`ingest-asn-metadata.js`): `require('dotenv').config();` → `require('../database')` (connects on
require) → `require('../models/mediaAsset')` → `main().then(() => process.exit(0)).catch(... process.exit(1))`.
Support a `--dry-run` flag (`process.argv.includes('--dry-run')`).

**Reference-aware — migrate only bytes a report actually points at.** A file-driven walk would
ingest *orphans* (files whose reports were pruned) as dead weight — after Step 1 the entire
`ioda/charts/` subtree on dev is orphaned (~937 files / ~322 MB). So build the migration from the
**referenced keys**, not the disk tree:

1. **Collect referenced keys** from Mongo:
   - IODA residual SVGs: `Report.distinct('metadata.rawAPIResponse.image', { _media: 'ioda', 'metadata.rawAPIResponse.image': { $type: 'string' } })`, keep only values that are storage keys (not inline SVG `^<` and not absolute URLs). On dev this is **empty** (Step 1 converted everything); on prod it's the un-convertible residuals.
   - Social images: the `imageKey` + `thumbnailKey` on report social attachments (whatever field holds them — confirm against `saveToDatabase.js` / the social channels before writing).
2. **For each referenced key:** resolve to a disk path under `getMediaRoot()`, read bytes, infer
   `contentType` (reuse `detectImageMimeType`; `.svg` → `image/svg+xml`), derive `kind` from the
   key prefix, then `updateOne({key}, {$set:{...}}, {upsert:true})` (idempotent). If a referenced
   key has **no file on disk**, log it as a dangling reference (don't fail the run).
3. **Skip the `ioda-charts-backup` dir** entirely — it's outside `MEDIA_ROOT` so a `getMediaRoot()`
   walk never sees it, but if any step reads the tree directly, exclude it explicitly.
4. **Report orphans without migrating them:** after the pass, walk the disk subtrees once to *count*
   files whose key was not in the referenced set, and log `orphaned=<n> (<bytes>)` so the operator
   can sweep/delete them separately (per the "back up, don't delete" preference — move to a backup
   dir rather than `unlink`). Never silently ingest or silently drop them.
- Log counts: `migrated`, `dangling` (referenced but missing on disk), `orphaned` (on disk, unreferenced).
  Leave disk files in place until verified.

### 5. `package.json` — add `sharp` as a prod dependency

`sharp` ships prebuilt binaries for macOS and linux-x64, so it installs cleanly on the Ubuntu VM.

### 6. `docs/claude/architecture/media-image-storage.md` — update to reflect Mongo-backed storage

Rewrite the "Where media lives" / "How it's persisted" / cross-instance sections to describe the
`mediaassets` collection and the streaming route (media now travels with the DB).

## Files to modify

- `backend/fetching/utils/socialImageStorage.js` — disk → Mongo; add `sharp`; export `normalizeKey`;
  drop the debug `console.log`; keep `getMediaRoot` for backfill.
- `backend/api.js` — replace both `/media` static mounts with the streaming route; swap the
  `getMediaRoot` import for `normalizeKey` + `MediaAsset`.
- `backend/models/mediaAsset.js` — **new** model.
- `backend/scripts/backfillMediaToMongo.js` — **new** one-time backfill.
- `package.json` — add `sharp`.
- `docs/claude/architecture/media-image-storage.md` — update.

**Untouched (contract preserved):** all `channels/*.js`, `hooks/postToReport.js`,
`hooks/saveToDatabase.js`, `reportController.js`, `report.js`, and all of `src/` frontend
(`resolveMediaUrl`, `useReportChartImage`, `ExpandableChart`, `MediaPreview`, etc.).

## Verification

1. **Social write:** run `npm run dev:backend`; trigger a Mastodon/Telegram-user fetch (or call
   `persistSocialImage` from a scratch script) → confirm two `mediaassets` docs (`social-full` +
   `social-thumb`) with correct `contentType`/`byteSize`, and a `sharp` thumbnail **smaller** than
   the original (proves the prod full-size-copy bug is fixed).
2. **IODA write:** trigger an IODA fetch → one `ioda-chart` doc keyed by `sha1(guid)`; re-fetch
   the same event → doc **updated in place** (same `_id`, new `updatedAt`), not duplicated.
3. **Serving:** `curl -i https://localhost:8000/media/<key>` for a social image and an SVG → 200
   with right `Content-Type`; repeat with `If-None-Match: <etag>` → 304; unknown key → 404.
   Confirm the `ioda-chart` ETag changes after a re-fetch (revalidation) while social ETags stay stable.
4. **End-to-end UI:** open a report with a social attachment and an IODA report → thumbnails
   render in the feed/`MediaPreview`, full image in detail, IODA chart via `ExpandableChart` — all
   unchanged, now served from Mongo.
5. **Backfill (reference-aware):** run `node backend/scripts/backfillMediaToMongo.js --dry-run` →
   `migrated` matches the count of **referenced** keys (on dev, IODA residuals = 0 after Step 1, so
   only social keys), and `orphaned` accounts for the ~937 unreferenced `ioda/charts` files (~322 MB)
   — which must **not** be in `migrated`. Run for real → existing reports' images still load; re-run
   → no duplicates (idempotent). Confirm `mediaassets` contains **no** orphan `ioda-chart` docs.
6. **Cutover:** grep confirms nothing else serves media from disk (`express.static`/`getMediaRoot`
   only in the retained backfill path); on a scratch instance, delete `public/media/` and confirm
   all images still serve from Mongo.
