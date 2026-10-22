# Cloudflare chart caching — design notes (not yet implemented)

> Status: **design only.** Captured while fixing alert chart alignment; deferred as out of scope for that pass.

## Problem

Cloudflare "traffic anomaly" charts render noticeably slower than IODA charts when an alert card is opened in the table/list view.

## Why (analysis)

- The alerts **list query already strips the chart** from every row — [backend/models/report.js:298-308](../../../backend/models/report.js#L298-L308) applies `select({ 'metadata.rawAPIResponse.image': 0 })` because the inline IODA SVGs (~330KB each) blew past the request timeout at ~43MB/page. **So the page load fetches zero charts today.**
- Charts load **lazily, per card**, via `useReportChartImage` → `GET /api/report/:id` ([src/components/SocialMediaPost/useReportChartImage.ts](../../../src/components/SocialMediaPost/useReportChartImage.ts)).
- **IODA** stores a self-contained chart at ingest — the SVG markup is fetched, cleaned, and saved on the report ([backend/fetching/channels/ioda.js:363-398](../../../backend/fetching/channels/ioda.js#L363-L398)) — so it paints immediately from local data.
- **Cloudflare** stores only a **live external URL** to Radar's on-demand renderer (`charts/TrafficTrendsXY/png?image=true&…`, [backend/fetching/channels/cloudflare.js:265-312](../../../backend/fetching/channels/cloudflare.js#L265-L312)). Opening a card triggers a cross-origin request that makes Cloudflare **re-run the query and render the PNG on the fly** — that round-trip is the delay.

## Options considered (page-load impact)

- **Blocking prefetch in the list response** — ❌ recreates the timeout problem (up to 50 slow Radar renders on the critical path).
- **Non-blocking idle prefetch of the visible page's CF charts** — ✅ no first-paint hit, but adds background load and needs a persistence endpoint to be worthwhile (otherwise it only warms one browser's cache).
- **Ingest-time cache (recommended)** — ✅ zero page-load cost; matches how IODA already works.

## Recommended approach — cache at ingest, mirroring IODA

In [backend/fetching/channels/cloudflare.js](../../../backend/fetching/channels/cloudflare.js), where `image` is currently set to the Radar URL (~lines 265/276):

1. Download the PNG from Radar during fetching.
2. Persist it to media storage — reuse `saveFile` in [backend/api/utils/fileStorage.js](../../../backend/api/utils/fileStorage.js) (or the same media path the IODA→media migration targets).
3. Store the resulting **media key** on `image` instead of the live URL.

The frontend already resolves keys via `resolveMediaUrl` → `/media/…`, so **no frontend change is needed**. Dedup identical charts per fetch cycle with an in-memory cache like IODA's `linkedPageCache`.

## Tradeoffs / notes

- The chart becomes a **static snapshot** at fetch time (acceptable — IODA is already a snapshot).
- Adds one HTTP fetch + file write per new CF event in the *fetching* process (not user-facing; never on page load).
- Consider a one-off **backfill** for existing CF reports still holding live URLs, or let them keep loading live until re-fetched.
- **Alternative** if snapshots are undesirable: a lazy **cache-on-first-open** endpoint that rewrites the URL to a media key the first time a CF card is viewed — no page-load work, first viewer still waits once.
