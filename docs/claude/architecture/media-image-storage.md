# Media & Image Storage

_Last updated: 2026-10-02_

How Aggie stores images from reports (social media attachments, alert charts) for every source
type, and what that means for sharing media across environments (e.g. QA vs. production).

> **IODA note:** as of the signal-JSON migration (design history in git), new IODA reports no longer store a
> chart image. They carry compact signal JSON inline (`metadata.rawAPIResponse.chart`) and
> render client-side with recharts: no `/media` bytes, and the live channel no longer calls
> `persistSvgChart`. Only **legacy** pre-migration IODA reports still reference
> `ioda/charts/*.svg` assets via `metadata.rawAPIResponse.image` (kept as a rendering
> fallback), populated by the `persistSvgChart` backfill (see
> `scripts/backfill-ioda-svg-to-json.js`). Everything below about IODA SVGs describes that
> legacy path.

## TL;DR

- Image **bytes live in MongoDB** in the `mediaassets` collection (inline `BinData`), served at
  `GET /media/<key>` by a streaming route. The route is **unauthenticated**.
- The report doc **only stores a pointer** (a key string, e.g. `social/full/{token}.jpg`); the
  bytes are a separate `mediaassets` doc keyed by that string. **Media travels with the DB**:
  no separate filesystem to mount, rsync, or back up.
- Per source type (the valid list is `backend/config/models/sourceConfigs.js`):
  - **Downloads bytes:** Mastodon, Telegram (user).
  - **Remote URL only (never stored in Mongo):** Junkipedia (which is how Twitter/X, Facebook,
    Instagram, TikTok, etc. arrive) and Cloudflare.
  - **No image at all:** IODA (new reports store signal JSON inline), OONI, Telegram (bot).
  - Legacy IODA reports still point at stored SVGs.

## Where media lives

- **Collection `mediaassets`**: model
  [`backend/models/mediaAsset.js`](../../../backend/models/mediaAsset.js). One doc per stored file:

  ```js
  { key, data /* Buffer */, contentType, byteSize,
    kind /* 'social-full' | 'social-thumb' | 'ioda-chart' */,
    sourcePlatform /* 'mastodon' | 'telegramUser' */, createdAt, updatedAt }
  ```

  `key` is uniquely indexed; `kind` is indexed for lifecycle queries.
- **Reads/writes** go through
  [`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js)
  (writes, in the FETCH process) and the `/media/*` route in
  [`backend/api.js`](../../../backend/api.js) (reads, in the API process). Both processes reach the
  model via plain DB I/O, so no cross-process event proxy is needed.
- **Served** at `GET /media/<key>` (no auth) by a single streaming handler (`serveMediaAsset`),
  registered before the auth-gated `/api` in both dev and prod.
- **URLs** are built by `buildMediaUrl(key)`, which prefixes `APP_BASE_PATH` (e.g. `/aggie/media/...`)
  so subpath deployments behind nginx resolve to the node app instead of the SPA. Empty in dev and
  at the domain root.

Key namespace (unchanged from the old disk layout):

```
ioda/charts/{sha1(guid)}.svg   # legacy IODA chart SVGs, deterministic key    → kind: ioda-chart
social/full/{token}.{ext}      # downloaded social images (Mastodon, Telegram) → kind: social-full
social/thumb/{token}.{ext}     # 320px thumbnails                              → kind: social-thumb
```

> **Legacy disk store:** bytes used to live on the local filesystem under `public/media/`
> (overridable via `MEDIA_ROOT`), served with `express.static`. That was migrated into Mongo by
> [`backend/scripts/backfillMediaToMongo.js`](../../../backend/scripts/backfillMediaToMongo.js).
> `MEDIA_ROOT` / `getMediaRoot()` survive only so the backfill scripts can walk the old tree;
> nothing in the live read/write path touches the filesystem anymore.

## Per-source storage strategy

### Alerts

| Source (`media`) | Bytes in Mongo? | What the report doc holds | Frontend rendering |
|--------|:--:|--------|--------|
| **IODA** (`ioda`) | ❌ No (new) / ✅ Yes (legacy) | New: `metadata.rawAPIResponse.chart` signal JSON. Legacy: `metadata.rawAPIResponse.image` = `ioda/charts/{sha1(guid)}.svg` (or an inline SVG string on very old reports) | `IodaEvent` → `IodaChart.tsx` (recharts); legacy falls back to `ExpandableChart` `<img>` |
| **Cloudflare Radar** (`cloudflare`) | ❌ No | `metadata.rawAPIResponse.image` = absolute `https://radar.cloudflare.com/charts/TrafficTrendsXY/png?...` URL, built per country or ASN | `TrafficEvent` → `ExpandableChart` `<img>` |
| **OONI** (`ooni`) | ❌ No | No image. Text content, an `explorer.ooni.org` link, and alert fields in `metadata.rawAPIResponse` | `OoniEvent` (no chart; `CompareCardBody` skips the chart-image fetch) |

### Social media

| Source (`media`) | Bytes in Mongo? | What the report doc holds | Frontend rendering |
|--------|:--:|--------|--------|
| **Mastodon** (`mastodon`) | ✅ Yes | `metadata.attachments[]` with `imageKey` = `social/full/{token}.{ext}` + `thumbnailKey` | `MediaPreview` via `getReportImages` |
| **Telegram user** (`telegramUser`) | ✅ Yes | Same as Mastodon | `MediaPreview` via `getReportImages` |
| **Telegram bot** (`telegramBot`) | ❌ No | No image. The channel drops every non-text message | Text only |
| **Junkipedia** (`junkipedia`) | ❌ No | `metadata.mediaUrl` = Junkipedia's `attributes.thumbnail_url` (external CDN URL). `_media` is Junkipedia's `platform_name` lowercased (`twitter`, `facebook`, `instagram`, `tiktok`, `truthsocial`, ...) | `MediaPreview` via `getReportImages` (falls back to `mediaUrl`) |

Notes on source coverage:

- **Twitter, Facebook and Instagram are not source types.** They only arrive as platforms inside
  Junkipedia. The `twitter` / `facebook` / `instagram` cases in
  [`backend/fetching/sourceToChannel.js`](../../../backend/fetching/sourceToChannel.js) are dead
  code: those values aren't in the `Source.media` enum, and the cases reference channel classes
  (`TwitterPageChannel`, `AggieCrowdTangleChannel`) that are no longer imported.
- **RSS is disabled.** `channels/rss.js` still exists, but `rss` isn't in the enum and its form is
  commented out in the source/credential UI. It never stored media.

### How it's persisted

- **Downloaded social images**: `persistSocialImage()` builds a 320px thumbnail in-memory with
  **`sharp`** and inserts two `mediaassets` docs (`social-full` + `social-thumb`) in one
  `MediaAsset.create([...])`. The channel puts the returned entry on `post.attachments`, and the
  `postToReport` hook copies it to `metadata.attachments`:

  ```js
  { type: 'image', imageKey: 'social/full/{token}.jpg',
    thumbnailKey: 'social/thumb/{token}.jpg', mimeType, sourcePlatform }
  ```

  Keys use `crypto.randomBytes(16)`. They're random, so the same post fetched in two environments
  produces **different** keys. (This replaced the macOS-only `sips` thumbnail shell-out, which
  silently produced full-size copies on the Ubuntu prod VM.)
  - **Mastodon** (`downloadImageAttachment`) only keeps statuses whose media is all images. A
    status with any non-image attachment (video, gifv, audio) is skipped entirely, not saved
    without its media.
  - **Telegram user** downloads single photo messages and grouped albums
    (`downloadPhotoAttachments`, one attachment per photo).

- **IODA charts (legacy path)**: `persistSvgChart()` upserts one `ioda-chart` doc keyed by
  `sha1(guid)` (deterministic, overwritten in place on re-fetch). The signal-JSON migration removed
  the *live channel's* call to it. New IODA reports store `metadata.rawAPIResponse.chart` JSON
  inline (fetched via `fetchSignals`) and are drawn by `IodaChart.tsx` (recharts). The helper is
  **retained** for the one-off scripts `scripts/backfill-ioda-svg-to-json.js` and the older
  `scripts/migrate-ioda-svg-to-storage.js`.

- **Serving to the frontend**: `serializeReport()` in
  [`backend/api/controllers/reportController.js`](../../../backend/api/controllers/reportController.js)
  (~L168-220) does two separate things:
  1. **Attachments**: maps each `metadata.attachments[]` entry's `thumbnailKey` / `imageKey` to
     `thumbnailUrl` / `imageUrl` via `buildMediaUrl`.
  2. **Chart image**: adds `metadata.rawAPIResponse.imageUrl` based on the shape of
     `metadata.rawAPIResponse.image`:
     - **inline SVG** (very old pre-migration IODA, starts with `<`): no URL, rendered inline
     - **absolute remote URL** (Cloudflare): passed through as-is
     - **relative media key** (legacy IODA SVG in `mediaassets`): resolved via `buildMediaUrl`

  On the client, `getReportImages()` in
  [`src/components/SocialMediaPost/mediaAttachments.ts`](../../../src/components/SocialMediaPost/mediaAttachments.ts)
  prefers `metadata.attachments` (thumbnail as preview, full image on expand) and falls back to
  `metadata.mediaUrl` (Junkipedia).

- **Caching**: the `/media/*` route sets `Cache-Control`/`ETag` per `kind`. `social/*` keys are
  random and never mutated, so they're `immutable`. `ioda-chart` overwrites in place, so it
  `must-revalidate` with an ETag keyed on `updatedAt` (a re-fetch busts the cache). `If-None-Match`
  yields `304`.

- **List vs. detail**: the report **list** query fetches rows in full
  ([`backend/models/report.js`](../../../backend/models/report.js) ~L363-372);
  `serializeReportResponse` then strips only the IODA signal series (`metadata.rawAPIResponse.chart`,
  `stripChart: true`). The detail endpoint (`GET /api/report/:id`) keeps it.
  `useReportChartSeries` lazy-fetches the full report to get the series. `useReportChartImage`
  does the same for `rawAPIResponse.image`, but since `image` is no longer stripped it is normally
  already present on list rows and no fetch happens.

### Lifecycle / cleanup

- **Failed or duplicate saves**: `saveToDatabase` calls `deleteSocialAttachments()` whenever
  `Report.create` throws, including the expected `11000` duplicate-guid error on re-fetch. Bytes
  downloaded for a post that isn't saved are removed instead of orphaned.
- **Partial Telegram albums**: if one photo in an album fails to download, the ones already
  stored are deleted before the error propagates.
- **Bulk trimming**: `backend/scripts/trim-reports-to-size.js --purge-media` deletes the social
  attachments and stored IODA SVG keys of the reports it trims (skipping remote URLs and inline
  SVGs).
- **Nothing else deletes media.** The API process never removes `mediaassets` when reports are
  deleted, so other report deletions (scripts, manual DB edits) can leave orphaned bytes.

## Can media be shared across MongoDB instances (QA ↔ production)?

**Yes, media travels with the database.** The bytes live in the `mediaassets` collection, so
copying/sharing the DB carries the images with it. Serving the same DB from any instance serves the
same media at `/media/<key>`, with no filesystem to mount or rsync.

### Caveats

- **Remote-URL sources** (Junkipedia, for all its platforms, and Cloudflare) were always portable:
  only the external URL is stored, never bytes. They do depend on the external host still serving
  that URL.
- **Random keys still prevent collisions but mean duplication**: two environments independently
  fetching the same Mastodon post produce different keys and therefore two copies. Only IODA's
  `sha1(guid)` keying is deterministic across environments.
- **`/media` is unauthenticated**: anyone who can reach the API can read any key. Auth is a
  separate future hardening task.
- **DB size**: inline `BinData` grows the `mediaassets` collection with the image bytes. Files are
  small (SVGs tiny, social images well under the 16 MB BSON cap). The reference-aware backfill
  deliberately skipped orphaned files so pruned-report bytes didn't bloat the DB.

## Key files

Storage and serving:

- [`backend/models/mediaAsset.js`](../../../backend/models/mediaAsset.js): `mediaassets` model (bytes + metadata)
- [`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js): storage core (`persistSocialImage`, `persistSvgChart`, `deleteMediaByKey`, `deleteSocialAttachments`, `buildMediaUrl`, `normalizeKey`; `getMediaRoot` retained for the backfills)
- [`backend/api.js`](../../../backend/api.js): `serveMediaAsset` streaming `/media/*` route
- [`backend/api/controllers/reportController.js`](../../../backend/api/controllers/reportController.js): `serializeReport()` / `serializeReportResponse()` URL construction and chart stripping
- [`backend/models/report.js`](../../../backend/models/report.js): Report schema (`_media`, `metadata.attachments`) and the list query

Fetching:

- [`backend/config/models/sourceConfigs.js`](../../../backend/config/models/sourceConfigs.js): the valid `Source.media` values
- [`backend/fetching/channels/mastodon.js`](../../../backend/fetching/channels/mastodon.js): Mastodon image download
- [`backend/fetching/channels/telegramUser.js`](../../../backend/fetching/channels/telegramUser.js): Telegram photo/album download
- [`backend/fetching/channels/telegramBot.js`](../../../backend/fetching/channels/telegramBot.js): text-only, no media
- [`backend/fetching/channels/junkipedia.js`](../../../backend/fetching/channels/junkipedia.js) + [`backend/fetching/utils/junkipediaUtils.js`](../../../backend/fetching/utils/junkipediaUtils.js): Junkipedia posts, `mediaUrl` from `thumbnail_url`
- [`backend/fetching/channels/ioda.js`](../../../backend/fetching/channels/ioda.js): IODA signal-JSON fetch (`fetchSignals`), stored inline as `metadata.rawAPIResponse.chart`
- [`backend/fetching/channels/cloudflare.js`](../../../backend/fetching/channels/cloudflare.js): Cloudflare chart URL (no download); base URL in [`backend/config/fetching/externalApis.js`](../../../backend/config/fetching/externalApis.js)
- [`backend/fetching/channels/ooni.js`](../../../backend/fetching/channels/ooni.js): OONI alerts, no media
- [`backend/fetching/hooks/postToReport.js`](../../../backend/fetching/hooks/postToReport.js): maps `post.attachments` / Junkipedia metadata onto the report
- [`backend/fetching/hooks/saveToDatabase.js`](../../../backend/fetching/hooks/saveToDatabase.js): deletes attachment bytes when a save fails

Frontend:

- [`src/components/SocialMediaPost/mediaAttachments.ts`](../../../src/components/SocialMediaPost/mediaAttachments.ts): `getReportImages()` (attachments first, then `mediaUrl`)
- [`src/components/SocialMediaPost/useReportChartImage.ts`](../../../src/components/SocialMediaPost/useReportChartImage.ts) / [`useReportChartSeries.ts`](../../../src/components/SocialMediaPost/useReportChartSeries.ts): lazy chart fetches for list rows
- [`src/components/SocialMediaPost/IodaChart.tsx`](../../../src/components/SocialMediaPost/IodaChart.tsx), [`ExpandableChart.tsx`](../../../src/components/SocialMediaPost/ExpandableChart.tsx), [`MediaPreview.tsx`](../../../src/components/SocialMediaPost/MediaPreview.tsx): renderers

Scripts:

- [`backend/scripts/backfillMediaToMongo.js`](../../../backend/scripts/backfillMediaToMongo.js): one-time reference-aware disk→Mongo backfill
- [`backend/scripts/trim-reports-to-size.js`](../../../backend/scripts/trim-reports-to-size.js): trims reports; `--purge-media` also deletes their media
- [`scripts/backfill-ioda-svg-to-json.js`](../../../scripts/backfill-ioda-svg-to-json.js), [`scripts/migrate-ioda-svg-to-storage.js`](../../../scripts/migrate-ioda-svg-to-storage.js): legacy IODA SVG migrations (only remaining `persistSvgChart` callers)
