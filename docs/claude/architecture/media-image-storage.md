# Media & Image Storage

_Last updated: 2026-08-10_

How Aggie stores images from reports — social media attachments and Cloudflare charts —
and what that means for sharing media across environments (e.g. QA vs. production).

> **IODA note:** as of the signal-JSON migration (design history in git), new IODA reports no longer store a
> chart image. They carry compact signal JSON inline (`metadata.rawAPIResponse.chart`) and
> render client-side with recharts — no `/media` bytes; the live channel no longer calls
> `persistSvgChart`. Only **legacy** pre-migration IODA reports still reference
> `ioda/charts/*.svg` assets via `metadata.rawAPIResponse.image` (kept as a rendering
> fallback), populated by the `persistSvgChart` backfill (see
> `scripts/backfill-ioda-svg-to-json.js`). Everything below about IODA describes that
> legacy path.

## TL;DR

- Image **bytes live in MongoDB** in the `mediaassets` collection (inline `BinData`), served at
  `GET /media/<key>` by a streaming route — still **unauthenticated**, same URL contract as before.
- The report doc **only stores a pointer** (a key string, e.g. `social/full/{token}.jpg`); the
  bytes are a separate `mediaassets` doc keyed by that string. **Media now travels with the DB** —
  no separate filesystem to mount, rsync, or back up.
- Only **Mastodon and Telegram (user)** download bytes. Twitter, Instagram, Facebook (via
  Junkipedia), and Cloudflare keep only a **remote URL** (never stored in Mongo). New IODA reports
  store signal JSON inline (no bytes); only legacy IODA reports still point at stored SVGs.

## Where media lives

- **Collection `mediaassets`** — model
  [`backend/models/mediaAsset.js`](../../../backend/models/mediaAsset.js). One doc per stored file:

  ```js
  { key, data /* Buffer */, contentType, byteSize,
    kind /* 'social-full' | 'social-thumb' | 'ioda-chart' */,
    sourcePlatform, createdAt, updatedAt }
  ```

  `key` is uniquely indexed; `kind` is indexed for lifecycle queries.
- **Reads/writes** go through
  [`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js)
  (writes, in the FETCH process) and the `/media/*` route in
  [`backend/api.js`](../../../backend/api.js) (reads, in the API process). Both processes reach the
  model via plain DB I/O — no cross-process event proxy needed.
- **Served** at `GET /media/<key>` (no auth) by a single streaming handler (`serveMediaAsset`),
  registered before the auth-gated `/api` in both dev and prod.

Key namespace (unchanged from the old disk layout):

```
ioda/charts/{sha1(guid)}.svg   # legacy IODA chart SVGs, deterministic key  → kind: ioda-chart
social/full/{token}.{ext}      # downloaded social images (Mastodon, Telegram) → kind: social-full
social/thumb/{token}.{ext}     # 320px thumbnails                            → kind: social-thumb
```

> **Legacy disk store:** bytes used to live on the local filesystem under `public/media/`
> (overridable via `MEDIA_ROOT`), served with `express.static`. That was migrated into Mongo by
> [`backend/scripts/backfillMediaToMongo.js`](../../../backend/scripts/backfillMediaToMongo.js).
> `MEDIA_ROOT` / `getMediaRoot()` survive only so that backfill can walk the old tree; nothing in
> the live read/write path touches the filesystem anymore.

## Per-source storage strategy

| Source | Bytes stored in Mongo? | What the report doc holds |
|--------|:--:|--------|
| **Mastodon** | ✅ Yes | `metadata.attachments[].imageKey` = `social/full/{token}.{ext}` (+ `thumbnailKey`) |
| **Telegram (user)** | ✅ Yes | Same as Mastodon |
| **IODA charts** (legacy only) | ✅ Yes | `metadata.rawAPIResponse.image` = `ioda/charts/{sha1(guid)}.svg`; new reports store `metadata.rawAPIResponse.chart` JSON instead (no bytes) |
| **Twitter / Instagram / Facebook** (Junkipedia) | ❌ No | `metadata.mediaUrl` = external CDN URL |
| **Cloudflare Radar charts** | ❌ No | `metadata.rawAPIResponse.image` = absolute `radar.cloudflare.com` URL |

### How it's persisted

- **Downloaded social images** → `persistSocialImage()` builds a 320px thumbnail in-memory with
  **`sharp`** and `insertOne`s two `mediaassets` docs (`social-full` + `social-thumb`); the
  `postToReport` hook then records an entry in `metadata.attachments`:

  ```js
  { type: 'image', imageKey: 'social/full/{token}.jpg',
    thumbnailKey: 'social/thumb/{token}.jpg', mimeType, sourcePlatform }
  ```

  Keys use `crypto.randomBytes(16)` — random, so the same post fetched in two environments
  produces **different** keys. (This replaced the macOS-only `sips` thumbnail shell-out, which
  silently produced full-size copies on the Ubuntu prod VM.)

- **IODA charts (legacy path)** → `persistSvgChart()` upserts one `ioda-chart` doc keyed by
  `sha1(guid)` (deterministic, overwritten in place on re-fetch). The signal-JSON migration removed
  the *live channel's* call to it — new IODA reports store `metadata.rawAPIResponse.chart` JSON
  inline and are drawn by `IodaChart.tsx` (recharts). The helper is **retained** for the one-off
  backfill `scripts/backfill-ioda-svg-to-json.js`.

- **Serving to the frontend** — `serializeReport()` in
  [`backend/api/controllers/reportController.js`](../../../backend/api/controllers/reportController.js)
  (~L44-70) distinguishes three shapes of `metadata.rawAPIResponse.image`:
  1. **inline SVG** (legacy pre-migration IODA) — rendered inline
  2. **absolute remote URL** (Cloudflare) — passed through as-is
  3. **relative media key** (IODA/social post-migration) — resolved via `buildMediaUrl`

- **Caching** — the `/media/*` route sets `Cache-Control`/`ETag` per `kind`: `social/*` keys are
  random and never mutated, so they're `immutable`; `ioda-chart` overwrites in place, so it
  `must-revalidate` with an ETag keyed on `updatedAt` (a re-fetch busts the cache). `If-None-Match`
  yields `304`.

- **List vs. detail** — the report **list** query excludes `metadata.rawAPIResponse.image`
  ([`backend/models/report.js`](../../../backend/models/report.js) ~L303-308) to keep payloads
  small; the frontend lazy-fetches the full report for the chart image via
  `useReportChartImage`.

## Can media be shared across MongoDB instances (QA ↔ production)?

**Yes — media now travels with the database.** The bytes live in the `mediaassets` collection, so
copying/sharing the DB carries the images with it. Serving the same DB from any instance serves the
same media at `/media/<key>` — no filesystem to mount or rsync.

### Caveats

- **Remote-URL sources** (Twitter/Instagram/Facebook/Cloudflare) were always portable — only the
  external URL is stored, never bytes.
- **Random keys still prevent collisions but mean duplication** — two environments independently
  fetching the same Mastodon post produce different keys and therefore two copies. Only IODA's
  `sha1(guid)` keying is deterministic across environments.
- **`/media` is unauthenticated** — anyone who can reach the API can read any key. Auth is a
  separate future hardening task.
- **DB size** — inline `BinData` grows the `mediaassets` collection with the image bytes. Files are
  small (SVGs tiny, social images well under the 16 MB BSON cap); the reference-aware backfill
  deliberately skips orphaned files so pruned-report bytes don't bloat the DB.

## Key files

- [`backend/models/mediaAsset.js`](../../../backend/models/mediaAsset.js) — `mediaassets` model (bytes + metadata)
- [`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js) — storage core (`persistSocialImage`, `persistSvgChart`, `deleteMediaByKey`, `buildMediaUrl`, `normalizeKey`; `getMediaRoot` retained for the backfill)
- [`backend/api.js`](../../../backend/api.js) — `serveMediaAsset` streaming `/media/*` route
- [`backend/scripts/backfillMediaToMongo.js`](../../../backend/scripts/backfillMediaToMongo.js) — one-time reference-aware disk→Mongo backfill
- [`backend/fetching/channels/mastodon.js`](../../../backend/fetching/channels/mastodon.js) — Mastodon image download
- [`backend/fetching/channels/telegramUser.js`](../../../backend/fetching/channels/telegramUser.js) — Telegram image download
- [`backend/fetching/channels/ioda.js`](../../../backend/fetching/channels/ioda.js) — IODA signal-JSON fetch (`fetchSignals`), stored inline as `metadata.rawAPIResponse.chart`
- [`backend/fetching/channels/cloudflare.js`](../../../backend/fetching/channels/cloudflare.js) — Cloudflare chart URL (no download)
- [`backend/api/controllers/reportController.js`](../../../backend/api/controllers/reportController.js) — `serializeReport()` URL construction
- [`backend/models/report.js`](../../../backend/models/report.js) — Report schema (`_media`, `metadata.attachments`)
