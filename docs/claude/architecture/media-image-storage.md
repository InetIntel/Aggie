# Media & Image Storage

_Last updated: 2026-08-10_

How Aggie stores images from reports — social media attachments and Cloudflare charts —
and what that means for sharing media across environments (e.g. QA vs. production).

> **IODA note:** as of the signal-JSON migration (see
> `docs/claude/plans/ioda-signals-json-to-recharts.md`), new IODA reports no longer store a
> chart image. They carry compact signal JSON inline (`metadata.rawAPIResponse.chart`) and
> render client-side with recharts — no `/media` bytes; the live channel no longer calls
> `persistSvgChart`. Only **legacy** pre-migration IODA reports still reference on-disk
> `ioda/charts/*.svg` files via `metadata.rawAPIResponse.image` (kept as a rendering
> fallback), populated by the `persistSvgChart` backfill (see
> `scripts/migrate-ioda-svg-to-storage.js`). Everything below about IODA describes that
> legacy path.

## TL;DR

- Image **bytes live on the local filesystem** under `public/media/` (overridable via
  `MEDIA_ROOT`), served as a static, **unauthenticated** route at `GET /media/<key>`.
- **MongoDB only stores a pointer** (a key/path string) — never the image bytes. There is
  no GridFS or binary blob in the DB.
- Only **Mastodon and Telegram (user)** download bytes locally. Twitter, Instagram,
  Facebook (via Junkipedia), and Cloudflare keep only a **remote URL**. New IODA reports store
  signal JSON inline (no bytes); only legacy IODA reports still point at on-disk SVGs.

## Where media lives

- Physical location: `public/media/` by default, configurable via the `MEDIA_ROOT` env var.
  Defined in [`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js).
- Served as static files at `GET /media/<key>` (no auth):
  - Dev: [`backend/api.js`](../../../backend/api.js) (~L97-100)
  - Prod: [`backend/api.js`](../../../backend/api.js) (~L189-192)

Directory layout:

```
public/media/
├── ioda/
│   └── charts/
│       └── {sha1(guid)}.svg      # IODA chart SVGs, deterministic key
└── social/
    ├── full/
    │   └── {token}.{ext}          # downloaded social images (Mastodon, Telegram)
    └── thumb/
        └── {token}.{ext}          # 320px thumbnails
```

## Per-source storage strategy

| Source | Bytes stored in `/media`? | What the DB holds |
|--------|:--:|--------|
| **Mastodon** | ✅ Yes | `metadata.attachments[].imageKey` = `social/full/{token}.{ext}` (+ `thumbnailKey`) |
| **Telegram (user)** | ✅ Yes | Same as Mastodon |
| **IODA charts** (legacy only) | ✅ Yes | `metadata.rawAPIResponse.image` = `ioda/charts/{sha1(guid)}.svg`; new reports store `metadata.rawAPIResponse.chart` JSON instead (no bytes) |
| **Twitter / Instagram / Facebook** (Junkipedia) | ❌ No | `metadata.mediaUrl` = external CDN URL |
| **Cloudflare Radar charts** | ❌ No | `metadata.rawAPIResponse.image` = absolute `radar.cloudflare.com` URL |

### How it's persisted

- **Downloaded social images** → `persistSocialImage()` writes a full image + a 320px
  thumbnail, then the `postToReport` hook records an entry in `metadata.attachments`:

  ```js
  { type: 'image', imageKey: 'social/full/{token}.jpg',
    thumbnailKey: 'social/thumb/{token}.jpg', mimeType, sourcePlatform }
  ```

  Keys use `crypto.randomBytes(16)` — random, so the same post fetched in two environments
  produces **different** files.

- **IODA charts (legacy path)** → `persistSvgChart()` writes an SVG keyed by `sha1(guid)`
  (deterministic, overwritten on re-run). The signal-JSON migration removed the *live channel's*
  call to it — new IODA reports store `metadata.rawAPIResponse.chart` JSON inline and are drawn
  by `IodaChart.tsx` (recharts). The helper is **retained** for the one-off backfill
  `scripts/migrate-ioda-svg-to-storage.js`, which moves legacy inline SVGs onto disk so old
  reports keep rendering via the `image` fallback.

- **Serving to the frontend** — `serializeReport()` in
  [`backend/api/controllers/reportController.js`](../../../backend/api/controllers/reportController.js)
  (~L44-70) distinguishes three shapes of `metadata.rawAPIResponse.image`:
  1. **inline SVG** (legacy pre-migration IODA) — rendered inline
  2. **absolute remote URL** (Cloudflare) — passed through as-is
  3. **relative media key** (IODA/social post-migration) — resolved via `buildMediaUrl`

- **List vs. detail** — the report **list** query excludes `metadata.rawAPIResponse.image`
  ([`backend/models/report.js`](../../../backend/models/report.js) ~L303-308) to keep payloads
  small; the frontend lazy-fetches the full report for the chart image via
  `useReportChartImage`.

## Can media be shared across MongoDB instances (QA ↔ production)?

**Not automatically** — because bytes live on local disk and the DB only holds a pointer.
Sharing the database does not share the images. Scenarios:

1. **Share the DB, not the files** → broken images. A doc references
   `social/full/abc.jpg`, but that file only exists on the other server's disk →
   `GET /media/...` returns 404.
2. **Share the DB *and* point both `MEDIA_ROOT`s at the same shared storage** (NFS mount or
   a store both environments mount) → works. Keys are stable, so any server with access
   serves the files.
3. **Copy the DB *and* rsync the media folder** → works as a point-in-time snapshot, but
   new images fetched afterward in one env won't appear in the other.

### Caveats

- **Remote-URL sources are inherently portable** — Twitter/Instagram/Facebook/Cloudflare
  render in any environment regardless of filesystem, since only the external URL is stored.
  The portability problem is specific to **Mastodon, Telegram, and IODA**.
- **Random keys prevent collisions but not sharing** — two environments fetching the same
  Mastodon post independently produce different files. Only IODA's `sha1(guid)` keying is
  deterministic across environments.
- **`/media` is unauthenticated** — centralizing behind a shared URL exposes it to any
  environment (or anyone).

### If true cross-instance sharing is the goal

Move media off local disk into shared object storage (S3/GCS/MinIO) and store the object
URL/key in the report. This is a real change, not a config toggle: `socialImageStorage.js`
is currently filesystem-only (`fs.writeFile` + `express.static`).

## Key files

- [`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js) — storage/serving core (`persistSocialImage`, `buildMediaUrl`, `getMediaRoot`; `persistSvgChart` retained for the legacy IODA backfill)
- [`backend/fetching/channels/mastodon.js`](../../../backend/fetching/channels/mastodon.js) — Mastodon image download
- [`backend/fetching/channels/telegramUser.js`](../../../backend/fetching/channels/telegramUser.js) — Telegram image download
- [`backend/fetching/channels/ioda.js`](../../../backend/fetching/channels/ioda.js) — IODA signal-JSON fetch (`fetchSignals`), stored inline as `metadata.rawAPIResponse.chart`
- [`backend/fetching/channels/cloudflare.js`](../../../backend/fetching/channels/cloudflare.js) — Cloudflare chart URL (no download)
- [`backend/api/controllers/reportController.js`](../../../backend/api/controllers/reportController.js) — `serializeReport()` URL construction
- [`backend/models/report.js`](../../../backend/models/report.js) — Report schema (`_media`, `metadata.attachments`)
- [`backend/api.js`](../../../backend/api.js) — `/media` static route
