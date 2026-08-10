# Migrate media bytes from `public/media/` into MongoDB — implementation & runbook

**Status:** Code complete and verified end-to-end on **dev**. Pending: commit, then run the media
backfill on **prod** and cut over (delete `public/media/`). Dev has no real referenced media (no
social sources; all IODA converted), so the dev backfill is a no-op — the real payload is on prod.

## Goal & approach

Image bytes for **Mastodon**, **Telegram (user)**, and **residual IODA chart SVGs** used to live on
the VM's local disk under `public/media/` (overridable via `MEDIA_ROOT`), served unauthenticated at
`GET /media/<key>`; MongoDB stored only the string key. That made media non-portable — sharing the
DB didn't share the images.

Now the **bytes live in MongoDB** (collection `mediaassets`, inline `BinData`), so media travels
with the database. The design preserves the **exact same keys and `/media/<key>` URL contract**, so
only *where bytes are written/read/deleted* changed — reports, controllers, channels, hooks, and the
entire frontend are untouched. Twitter/Instagram/Facebook (Junkipedia) and Cloudflare are unaffected
(they only ever store a remote URL).

Two ordered steps:
- **Step 1** converts legacy IODA chart SVGs to compact signal JSON on the report (so ~427 MB of
  chart SVGs never enter Mongo — they become ~KB JSON, or are dropped as orphans).
- **Step 2** moves the remaining *referenced* bytes (social images + un-convertible IODA SVGs) into
  `mediaassets`, and serves them from there.

> **Ordering matters:** Step 1 must run *before* the Step-2 storage rewrite is deployed, because
> Step 1's `keptAsSvg` path calls `persistSvgChart` expecting it to write to **disk**. (On dev this
> already happened; Step 1 ran while `socialImageStorage.js` was still disk-based.)

---

## Step 1 — convert legacy IODA SVGs → signal JSON  ✅ done on dev

**Script:** [`scripts/backfill-ioda-svg-to-json.js`](../../../scripts/backfill-ioda-svg-to-json.js)
(committed). Walks legacy IODA reports (`metadata.rawAPIResponse.image` present, no `chart`),
reconstructs the signals window from `rawEvent.location/start/duration`, and re-fetches the series
via `fetchSignals` (an SVG is a rendered picture and can't be decoded back to data, so the real
series must come from IODA's API).

Per-report outcomes:
- **converted** — signals returned data → set `metadata.rawAPIResponse.chart`, delete `.image`, and
  **move** the disk SVG into `../ioda-charts-backup` (outside `MEDIA_ROOT`, so the Step-2 backfill
  never re-ingests it). Never deletes — bad conversions are restorable.
- **keptAsSvg** — IODA has no data for that old window → keep the SVG fallback; an inline SVG is
  promoted onto disk via `persistSvgChart` so Step 2 migrates it uniformly.
- **skipped** — already has `chart`, or no reconstructable `rawEvent`.
- **failed** — the signals fetch threw (network/5xx); left untouched, safe to re-run.

Idempotent (only reports lacking `chart` are touched) and `--dry-run`-able.

### Run it
```bash
# 1. Classify every report without writing — gives the residual (keptAsSvg) count up front:
node scripts/backfill-ioda-svg-to-json.js --dry-run
#    → "Done (dry run …). converted=<n>, keptAsSvg=<n>, skipped=<n>, failed=<n>."

# 2. Run for real:
node scripts/backfill-ioda-svg-to-json.js
```

### How to test it
- **Counts sane:** dry-run `converted + keptAsSvg + skipped + failed` == total legacy IODA reports;
  `failed` should be ~0 (retry if transient). On dev this converted all 545 IODA reports.
- **A converted report:** `metadata.rawAPIResponse.chart.series` is a non-empty array and `.image`
  is gone; its old SVG now lives under `public/ioda-charts-backup/ioda/charts/<sha1>.svg`.
- **A keptAsSvg report:** still has `metadata.rawAPIResponse.image` pointing at an
  `ioda/charts/<sha1>.svg` on disk (this is what Step 2 migrates).
- **UI:** open a converted report → renders via recharts (`IodaChart.tsx`); open a keptAsSvg report
  → renders the SVG fallback. `IodaEvent.tsx` already handles all three shapes (chart / inline SVG /
  `/media` `<img>`), so no frontend change was needed.

**Sizing (measured on dev):** 545 IODA reports, ~461 convertible; each `chart` JSON ~6.7 KB (~3 MB
added to `reports`) while moving ~427 MB of SVG off the migration path.

---

## Step 2 — move remaining media bytes into MongoDB  ✅ code complete, verified on dev

### Data model — `backend/models/mediaAsset.js` (new), collection `mediaassets`
```js
{
  key,            // String, UNIQUE index — same keys as before:
                  //   "social/full/{token}.{ext}", "social/thumb/{token}.{ext}", "ioda/charts/{sha1}.svg"
  data,           // Buffer (BSON BinData) — the actual bytes
  contentType,    // "image/jpeg|png|gif|webp" | "image/svg+xml"
  byteSize,       // Number
  kind,           // "social-full" | "social-thumb" | "ioda-chart"  (indexed)
  sourcePlatform, // optional; "mastodon" | "telegramUser"
  createdAt, updatedAt, // via { timestamps: true }
}
```
Both the FETCH process (writes) and API process (reads) reach it via plain DB I/O — no cross-process
event proxy needed.

### Changes made
| File | Change |
|------|--------|
| [`backend/models/mediaAsset.js`](../../../backend/models/mediaAsset.js) | **New** model / `mediaassets` collection (schema above). |
| [`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js) | Disk→Mongo, same public API. `persistSocialImage` builds the thumbnail in-memory with **`sharp`** (`fit:'inside'`, 320px) and `create`s two docs (`social-full` + `social-thumb`). `persistSvgChart` upserts one `ioda-chart` doc keyed by `sha1(guid)`. `deleteMediaByKey` → `deleteOne`. **Exported `normalizeKey`**. Removed `sips`/`execFile`/`fs`-write + the debug `console.log`. **Kept `getMediaRoot`/`MEDIA_ROOT`** (backfill needs them). |
| [`backend/api.js`](../../../backend/api.js) | Replaced **both** `express.static('/media')` mounts (dev + prod) with one streaming `serveMediaAsset` handler at `GET /media/*`, mounted before the auth-gated `/api`. Swapped the `getMediaRoot` import for `normalizeKey` + `MediaAsset`. |
| [`backend/scripts/backfillMediaToMongo.js`](../../../backend/scripts/backfillMediaToMongo.js) | **New** one-time, idempotent, reference-aware backfill (see below), `--dry-run`. |
| [`package.json`](../../../package.json) | Added `sharp` `^0.35.3` (prebuilt macOS + linux-x64 binaries). |
| [`docs/claude/architecture/media-image-storage.md`](../architecture/media-image-storage.md) | Rewritten for Mongo-backed storage. |

**Untouched (contract preserved):** all `channels/*.js`, `hooks/postToReport.js`,
`hooks/saveToDatabase.js`, `reportController.js`, `report.js`, and the entire `src/` frontend.

### Serving route (`serveMediaAsset` in `api.js`)
```js
app.get('/media/*', async (req, res) => {
  const key = normalizeKey(req.params[0]);
  const asset = await MediaAsset.findOne({ key }).lean();
  if (!asset) return res.sendStatus(404);
  // GOTCHA: under .lean(), Mongoose 5.9's driver returns BinData as a mongodb.Binary wrapper,
  // NOT a Node Buffer — res.send would JSON-serialize it. Coerce to the underlying Buffer.
  const data = Buffer.isBuffer(asset.data) ? asset.data : asset.data.buffer;
  const isImmutable = asset.kind !== 'ioda-chart';           // social keys are random & never mutated
  const etag = isImmutable ? asset.key : `${asset.key}:${asset.updatedAt.getTime()}`; // ioda re-fetch busts it
  res.set('Content-Type', asset.contentType);
  res.set('Cache-Control', isImmutable ? 'public, max-age=31536000, immutable'
                                       : 'public, max-age=0, must-revalidate');
  res.set('ETag', etag);
  if (req.headers['if-none-match'] === etag) return res.sendStatus(304);
  res.send(data);
});
```

### Reference-aware backfill — `backend/scripts/backfillMediaToMongo.js`
Migrates only keys a **report actually references**, not the disk tree. A file-driven walk would
ingest *orphans* (files whose reports were pruned) as dead weight — after Step 1 the entire
`ioda/charts/` subtree on dev is orphaned (~937 files / ~322 MB), and we must not put that in Mongo.

1. **Collect referenced keys:** social `metadata.attachments[].imageKey` / `.thumbnailKey`, plus IODA
   `metadata.rawAPIResponse.image` (string, `_media:'ioda'`, filtering out inline `^<` SVG and
   absolute `http(s)://` URLs).
2. **Migrate each:** resolve under `getMediaRoot()`, read bytes, infer `contentType`, derive `kind`
   from the key prefix, `updateOne({key}, {$set:{…}}, {upsert:true})`. Referenced key with no file on
   disk → logged as **dangling** (doesn't fail the run).
3. **Report orphans without migrating:** walk the managed subtrees once to *count* unreferenced files
   and log `orphaned=<n> (<MiB>)` so they can be swept/backed-up separately.

Output line: `migrated=<n> (<MiB>), dangling=<n>, orphaned=<n> (<MiB>)`.

### Run it
```bash
node backend/scripts/backfillMediaToMongo.js --dry-run   # inspect migrated / dangling / orphaned
node backend/scripts/backfillMediaToMongo.js             # real run (idempotent — re-runnable)
```

---

## How to test Step 2

All of the following were run and **passed on dev**.

### 1. Storage write path (scratch script)
Generate a PNG with `sharp`, call `persistSocialImage({buffer, mimeType:'image/png', sourcePlatform:'telegramUser'})`:
- two `mediaassets` docs appear (`social-full` + `social-thumb`), correct `contentType`/`byteSize`;
- the thumbnail's `byteSize` is **smaller** than the full image and its dimensions are ≤320px
  (proves the sharp thumbnail works — the old `sips` shell-out silently produced full-size copies on
  the Ubuntu prod VM).

Then `persistSvgChart({svg, guid})` twice with the same `guid`:
- one `ioda-chart` doc, same `_id` both times, `updatedAt` bumped on the second call (overwrite in
  place, not duplicated).

### 2. Serving route (live backend)
```bash
ENVIRONMENT=development node app.js &            # boots on http://127.0.0.1:3000 (HTTP if no certs)
curl -i  http://127.0.0.1:3000/media/<socialKey> # 200, image/png, Cache-Control: …immutable
curl -i  http://127.0.0.1:3000/media/<iodaKey>   # 200, image/svg+xml, …must-revalidate, ETag ends ":<ts>"
curl -o out.png http://127.0.0.1:3000/media/<socialKey> && file out.png   # valid PNG (proves the Binary→Buffer fix)
curl -o /dev/null -w '%{http_code}\n' -H 'If-None-Match: <socialKey>' http://127.0.0.1:3000/media/<socialKey>  # 304
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/media/nope.png                                     # 404
```

### 3. Backfill (reference-aware)
`--dry-run` then real. `migrated` == number of referenced keys, `dangling` == 0, and `orphaned`
accounts for unreferenced files that must **not** appear in `migrated`.

### 4. Controlled end-to-end proof (the "did it really move from `public/media/`?" test)
Because dev has no real referenced media, seed the pre-migration state, migrate, and prove
serve-from-Mongo. This is the reusable recipe (all steps passed):
1. Write real files into `public/media/{social/full,social/thumb,ioda/charts}` and create throwaway
   reports referencing those keys. **Give each report a unique `guid`** — `reports` has a unique
   `guid` index, so null guids collide. Confirm `mediaassets` has 0 docs for those keys.
2. `node backend/scripts/backfillMediaToMongo.js` → `migrated=3, dangling=0` (unreferenced files
   show up under `orphaned` and are skipped).
3. For each key, compare `mediaassets` doc bytes to the disk file with `Buffer.compare(...) === 0`
   (byte-identical), correct `kind`/`contentType`.
4. **Delete the disk files**, boot the backend, `curl /media/<key>` → still `200` with the original
   bytes (valid PNG / exact SVG) — proves serving is purely Mongo-backed.
5. Clean up: delete the throwaway reports (`content` marker), the `mediaassets` docs, and the seeded
   disk files; restore dev to its prior state.

---

## Prod cutover runbook

1. **Deploy** the Step-2 code and `npm ci` (installs `sharp`).
2. **Confirm Step 1 has run on prod** (IODA SVGs converted / residuals promoted to disk).
3. `node backend/scripts/backfillMediaToMongo.js --dry-run` → review `migrated` (should equal the
   referenced-key count), `dangling` (should be 0 — investigate any), `orphaned` (expected: pruned
   IODA charts; not migrated).
4. `node backend/scripts/backfillMediaToMongo.js` for real. Re-run to confirm idempotency (no dupes).
5. **Verify serving:** spot-check a social image and an IODA SVG via `curl /media/<key>` (200 + right
   `Content-Type`); confirm reports render in the UI (feed thumbnails, detail full image, IODA chart).
6. **Cutover:** on a scratch/QA copy, move `public/media` aside and confirm all images still serve
   from Mongo. Then retire `public/media/` on prod (back up first — don't hard-delete). The orphaned
   `ioda/charts/*` and `public/ioda-charts-backup/` can be archived/removed separately.

## Gotchas encountered
- **`.lean()` + BinData:** Mongoose 5.9's driver returns `Buffer` schema fields as a `mongodb.Binary`
  wrapper under `.lean()`, not a Node `Buffer`; `res.send` would JSON-serialize it. The route coerces
  via `Buffer.isBuffer(asset.data) ? asset.data : asset.data.buffer`.
- **`reports` unique `guid` index:** seeding test reports with null `guid` throws `E11000`; give each
  a unique `guid`.
- **Dev has no real referenced media:** only twitter (remote URL), converted IODA, and orphaned SVGs
  — so a plain dev backfill migrates 0. The seeded proof above is the only way to exercise a non-zero
  migration on dev.
