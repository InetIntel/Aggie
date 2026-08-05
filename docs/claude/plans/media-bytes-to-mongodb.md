# Plan: Move media bytes from `public/media/` into a MongoDB collection

## Context

Today, image bytes for **Mastodon**, **Telegram (user)**, and **IODA charts** live on the VM's local filesystem under `public/media/` (overridable via `MEDIA_ROOT`) and are served **unauthenticated** as static files at `GET /media/<key>`. MongoDB only stores small **string keys** — never bytes. This makes media non-portable across environments (sharing the DB doesn't share the images; QA and prod each need their own disk, backed up separately) and couples image durability to the VM's disk rather than the database.

Goal: store the bytes **in MongoDB** so media travels with the database — no separate filesystem to mount, rsync, or back up. Twitter/Instagram/Facebook (Junkipedia) and Cloudflare are **unaffected** — they only ever store a remote URL, never local bytes.

**Decisions locked with the user:**
- **Storage engine:** single collection with inline `BinData` (`Buffer`) — not GridFS. Files here are small (SVGs tiny, social images well under the 16MB BSON cap).
- **Serving auth:** keep `/media/<key>` **unauthenticated**, exactly as today. Zero frontend changes. (Auth is a separate future hardening task.)
- **Existing files:** **backfill** everything currently in `public/media/` into Mongo via a one-time script; retire the folder afterward.
- **Thumbnails (recommended, flagged):** replace the macOS-only `sips` shell-out with in-memory `sharp`. `sips` doesn't exist on the Ubuntu prod VM, so prod thumbnails are currently silent full-size copies — a latent bug this migration is well-placed to fix.

## Why the surface area is small

Reports reference media by **string key** (`metadata.attachments[].imageKey`/`thumbnailKey`, `metadata.rawAPIResponse.image`), and keys become URLs (`/media/<key>`) at read time. Because we **preserve the exact same keys and the `/media/<key>` URL contract**, we touch:
- **no report documents**,
- **no frontend files** (`resolveMediaUrl`, `useReportChartImage`, `ExpandableChart`, `MediaPreview`, etc. all keep working),
- **no `serializeReport` logic** in `reportController.js`,
- **no channel call sites** (`mastodon.js`, `telegramUser.js`, `ioda.js` keep calling the same `persist*` functions with the same signatures).

We change only *where bytes are written/read/deleted* (inside `socialImageStorage.js`) and *how `/media` is served* (in `api.js`).

## Data model

New Mongoose model `backend/models/mediaAsset.js`, collection `mediaassets`:

```js
{
  _id:            ObjectId,
  key:            String,   // UNIQUE index. Same keys as today:
                            //   "social/full/{token}.{ext}", "social/thumb/{token}.{ext}",
                            //   "ioda/charts/{sha1(guid)}.svg"
  data:           Buffer,   // BSON BinData — the actual bytes
  contentType:    String,   // "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/svg+xml"
  byteSize:       Number,
  kind:           String,   // "social-full" | "social-thumb" | "ioda-chart" (lifecycle/cleanup queries)
  sourcePlatform: String,   // optional, mirrors attachment.sourcePlatform
  createdAt:      Date,
  updatedAt:      Date,
}
```

- **Unique index on `key`** — enforces the identity and makes serving a single indexed lookup.
- **Write-once social images** (`insertOne`); **IODA charts** are deterministic per `guid` and re-fetched during ongoing outages → `updateOne({key}, …, {upsert:true})` to preserve overwrite-in-place semantics.
- Model lives in `backend/models/` so **both** the FETCH process (writes during fetching) and the API process (reads while serving) reach it directly — no cross-process event proxy needed, since this is plain DB I/O, not a Mongoose event.

## Changes

### 1. `backend/fetching/utils/socialImageStorage.js` (core rewrite, same public API)

Keep every exported signature identical so callers are untouched: `buildMediaUrl`, `persistSocialImage`, `persistSvgChart`, `deleteMediaByKey`, `deleteSocialAttachments`, `detectImageMimeType`, `MEDIA_ROUTE_PREFIX`. `getMediaRoot` becomes unused (see route change) — remove it and its stray `console.log`.

- `persistSocialImage({ buffer, sourcePlatform, mimeType })` — unchanged return shape `{ type, imageKey, thumbnailKey, mimeType, sourcePlatform }`. Internally:
  - detect mime (existing `detectImageMimeType`), generate the same random-token keys,
  - build the thumbnail **in-memory with `sharp`** (`.resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })`), replacing `createThumbnail`/`sips`/tmpdir,
  - `insertOne` a `mediaassets` doc for `social/full/...` and one for `social/thumb/...`.
- `persistSvgChart({ svg, guid })` — unchanged return (bare key string). Compute `sha1(guid)` key, `updateOne({key}, {data, contentType:'image/svg+xml', kind:'ioda-chart', …}, {upsert:true})`.
- `deleteMediaByKey(key)` → `deleteOne({ key })`. `deleteSocialAttachments(attachments)` unchanged (still iterates `imageKey`/`thumbnailKey` → `deleteMediaByKey`).
- `buildMediaUrl(key)` and `normalizeKey` unchanged — still emit `/media/<key>`.
- Drop `fs`, `os`, `path`-to-disk, `execFile` usage.

### 2. `backend/api.js` — replace the two `express.static` mounts with a streaming route

Both the dev (~L97-100) and prod (~L189-192) `app.use('/media', express.static(getMediaRoot()))` become one handler mounted at the same path:

```js
app.get('/media/*', async (req, res) => {
  const key = normalizeKey(req.params[0]);
  const asset = await MediaAsset.findOne({ key }).lean();
  if (!asset) return res.sendStatus(404);
  res.set('Content-Type', asset.contentType);
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); // social keys are content-addressed/random; safe to cache hard
  res.set('ETag', asset.key);
  if (req.headers['if-none-match'] === asset.key) return res.sendStatus(304);
  res.send(asset.data); // Buffer
});
```

- Stays **before** auth-gated `/api`, preserving unauthenticated access.
- Immutable caching is safe for `social/*` (random tokens, never mutated). IODA charts overwrite in place — use a weaker `Cache-Control` (e.g. `no-cache` / short max-age with revalidation) for `ioda-chart`, or key the ETag on `updatedAt` so a re-fetched chart busts the cache. Decide per-`kind` in the handler.

### 3. `backend/models/mediaAsset.js` — new model (schema above).

### 4. Backfill script `backend/scripts/backfillMediaToMongo.js` (one-time)

- Walk `getMediaRoot()`'s three subtrees (`social/full`, `social/thumb`, `ioda/charts`).
- For each file: derive `key` from its path relative to the media root, read bytes, infer `contentType` (reuse `detectImageMimeType`; `.svg` → `image/svg+xml`), `updateOne({key}, …, {upsert:true})` (idempotent, re-runnable).
- Log counts; leave disk files in place until verified, then the `public/media/` tree can be deleted.

### 5. Dependency

Add `sharp` to `package.json` (prod dependency) — only if the thumbnail recommendation is accepted. If vetoed, keep thumbnails as a plain full-size copy of the buffer (drop `sips` regardless; it's dead weight in prod).

## Files to modify

- `backend/fetching/utils/socialImageStorage.js` — core storage rewrite (disk → Mongo).
- `backend/api.js` — replace `/media` static mounts (dev + prod) with the streaming route; drop `getMediaRoot` import.
- `backend/models/mediaAsset.js` — **new** model.
- `backend/scripts/backfillMediaToMongo.js` — **new** one-time backfill.
- `package.json` — add `sharp` (if thumbnail change accepted).
- `docs/claude/architecture/media-image-storage.md` — update to reflect Mongo-backed storage.

**Untouched (contract preserved):** all `channels/*.js`, `hooks/postToReport.js`, `hooks/saveToDatabase.js`, `reportController.js`, `report.js`, and all of `src/` frontend.

## Verification

1. **Unit-ish, local:** run backend (`npm run dev:backend`); trigger a Mastodon/Telegram-user fetch (or invoke `persistSocialImage` from a scratch script) → confirm two `mediaassets` docs (`social/full`, `social/thumb`) with correct `contentType`/`byteSize`, and a valid in-memory thumbnail smaller than the original.
2. **IODA:** trigger an IODA fetch → confirm one `ioda-chart` doc keyed by `sha1(guid)`; re-fetch the same event → confirm the doc is **updated in place** (same `_id`, new `updatedAt`), not duplicated.
3. **Serving:** `curl -i https://localhost:8000/media/<key>` (proxied) for a social image and an SVG → 200 with right `Content-Type`; repeat with `If-None-Match: <key>` → 304; unknown key → 404.
4. **End-to-end UI:** open a report with a social attachment and an IODA report in the app → thumbnails render in the feed/`MediaPreview`, full image in detail, IODA chart renders via `ExpandableChart` — all unchanged, now served from Mongo.
5. **Backfill:** run `backfillMediaToMongo.js` against a copy of `public/media/`; confirm counts match file counts and existing reports' images still load. Re-run → no duplicates (idempotent).
6. **Cutover check:** grep confirms nothing else calls `getMediaRoot`/`express.static` for media; delete `public/media/` on a scratch instance and confirm all images still serve from Mongo.
