# Follow-up: move IODA chart SVGs out of MongoDB into file storage

> **Status: implemented & verified** on branch `fix/ioda-svg-media-storage` (off `fix/reports-timeout-double-send`). Migration run on dev moved **916** reports; alerts list dropped from ~43MB/60s-timeout to ~90KB/0.3s. Code snippets below match the committed implementation.

## Branch strategy

New branch `fix/ioda-svg-media-storage`, cut **from the current `fix/reports-timeout-double-send` branch** (not from `staging`), so it carries the timeout/double-send fixes already made and is self-contained. Because those fixes come along, the list-projection exclusion line exists on this base, so **step #6 (remove the band-aid) stays in scope here** rather than being deferred. Claude makes the edits; the user commits (no commits by Claude).

## Context

The timeout fix stopped the alerts list from shipping a ~330KB inline SVG chart per IODA report by excluding `metadata.rawAPIResponse.image` from the list query. That was a band-aid: the SVG still bloats every IODA document (~440KB avg vs ~1KB for other reports), and excluding it means the feature branch's alert table / compare modal can't show charts from list data. This follow-up removes the SVG from the documents entirely, storing each chart as a file served over `/media` (reusing the existing social-image storage infra) and keeping only a small key in the document.

### Key finding — how IODA writes to Mongo (answers "are they overwritten every fetch?")

IODA is the **one source that does not just reject duplicates** — it overwrites. Every other source goes postToReport → `Report.create()`, and a re-fetch of an existing `guid` is rejected by the unique index (the E11000 we quieted). IODA instead runs its **own** dedup in the channel ([ioda.js:176-218](../../backend/fetching/channels/ioda.js#L176)):

- New event → `enqueue` → normal hooks pipeline → `Report.create` (new doc).
- **Existing event (matched by `guid`)** → `Report.findOne` → overwrites `existingReport.metadata.rawAPIResponse = formattedEvent.raw` (re-scraped SVG included) → `save()` — **every fetch interval**.

So an IODA report's SVG is **re-scraped and re-written on every poll** (the outage may still be ongoing, so the chart legitimately changes). This is the design constraint: the new storage path must be **stable-keyed per `guid`** so the update overwrites the same file in place — otherwise we'd orphan a ~330KB file on disk every fetch cycle.

`guid` is stable per event: `platformID = `${queryType}-${event.start}-${event.location}-${event.datasource}`` ([ioda.js:322](../../backend/fetching/channels/ioda.js#L322)), copied to `report.guid` in [postToReport.js:37](../../backend/fetching/hooks/postToReport.js#L37).

## Design

### 1. New storage helper — `persistSvgChart` in [socialImageStorage.js](../../backend/fetching/utils/socialImageStorage.js)

Existing `persistSocialImage` can't be reused as-is: it detects mime from binary magic bytes, makes a `sips` thumbnail, and uses a **random** token (we need a deterministic key). Add a small sibling (`crypto` is already required at the top of the file):

```js
async function persistSvgChart({ svg, guid }) {
  if (!svg || typeof svg !== 'string' || !guid) return null;

  // Deterministic, filesystem-safe key per event. IODA re-scrapes and overwrites
  // the chart on every poll while an outage is ongoing; keying by guid means the
  // re-fetch overwrites the same file in place instead of orphaning a new one.
  const hash = crypto.createHash('sha1').update(String(guid)).digest('hex');
  const key = `ioda/charts/${hash}.svg`;
  const fullPath = resolveMediaPath(key);

  await ensureParentDir(fullPath);
  await fs.writeFile(fullPath, svg, 'utf-8');

  return key; // stored in place of the inline SVG string
}
```

No thumbnail (SVG is vector — scales in an `<img>`). Reuses existing `resolveMediaPath` / `ensureParentDir`. Export it; also export the existing `deleteMediaByKey` (previously unexported) for cleanup.

### 2. Channel integration — single point in [ioda.js](../../backend/fetching/channels/ioda.js) (~line 363)

Keep caching the **extracted SVG string** per linked page (the Playwright scrape is expensive and multiple events can share a `linkedPage`), but persist to storage per-`guid` so each report owns its own chart file. Store the returned **key** (not the SVG) in `raw.image`:

```js
// Extract the chart SVG once per linked page (the Playwright scrape is expensive).
let svg = this.linkedPageCache[linkedPage];
if (svg === undefined) {
    try {
        svg = await extractCleanSVGFromPage(this.browser, linkedPage, queryType);
    } catch (err) {
        console.error(`Error extracting SVG for URL ${linkedPage}:`, err);
        svg = null;
    }
    this.linkedPageCache[linkedPage] = svg;
}

// Persist the SVG to media storage keyed by guid and store the key (not the
// raw SVG) on the report, so list/detail responses stay small. Keyed by guid
// means a re-fetch of the same outage overwrites the same file in place.
if (svg) {
    try {
        image = await persistSvgChart({ svg, guid });
    } catch (err) {
        console.error(`Error persisting SVG chart for guid ${guid}:`, err);
    }
}
```

(`guid` is already in scope — the `platformID`. The cache stores the SVG string keyed by `linkedPage`; a cached `null` means a failed scrape and is not retried in the same run.)

This one change covers **both** paths because both read `formattedEvent.raw`:
- New report → `raw.image` (key) flows through postToReport → `metadata.rawAPIResponse.image`.
- Update path ([ioda.js:197](../../backend/fetching/channels/ioda.js#L197)) → assigns the same `formattedEvent.raw` (key) → same stable file overwritten.

### 3. Serialize a URL — `serializeReport` in [reportController.js](../../backend/api/controllers/reportController.js#L44)

`metadata.rawAPIResponse.image` now holds a key. Emit a sibling URL the frontend can use (guard so a legacy inline SVG — starts with `<` — still passes through during rollout):

```js
const rawAPIResponse = plainReport?.metadata?.rawAPIResponse;
const chartKey = rawAPIResponse?.image;
const rawAPIResponseWithUrl =
  chartKey && typeof chartKey === 'string' && !chartKey.trimStart().startsWith('<')
    ? { ...rawAPIResponse, imageUrl: buildMediaUrl(chartKey) }
    : rawAPIResponse;
```

Fold it into the returned metadata alongside the existing `attachments` handling, only when present: `...(rawAPIResponse ? { rawAPIResponse: rawAPIResponseWithUrl } : {})`.

### 4. Frontend — render via `<img>`

- [IodaEvent.tsx](../../src/components/SocialMediaPost/IodaEvent.tsx): replace the `dangerouslySetInnerHTML` SVG-string block with `<img src={rawData?.imageUrl} alt='outage chart' className='w-full h-auto' />` (drops the width/height string-replace hack — CSS handles sizing; also dropped the now-unused `isObject`/`isString` lodash import).
- [TrafficEvent.tsx](../../src/components/SocialMediaPost/TrafficEvent.tsx): already `<img src={rawData?.image}>` — point it at `rawData?.imageUrl`.
- [src/api/reports/types.ts](../../src/api/reports/types.ts): add `image?: string` and `imageUrl?: string` to `RawApiResponse` (it already has an index signature, so this is for clarity).

### 5. One-off migration for the existing IODA reports

[scripts/migrate-ioda-svg-to-storage.js](../../scripts/migrate-ioda-svg-to-storage.js), connecting via `backend/database`. Idempotent — the cursor filter (`'metadata.rawAPIResponse.image': /^\s*</`) only matches docs whose `image` is still an inline SVG, and each doc is re-checked with an `isInlineSvg` guard before writing. The script tallies `migrated`/`skipped`/`failed` and logs progress every 100. Core loop:

```js
const key = await persistSvgChart({ svg, guid: report.guid });
report.metadata.rawAPIResponse.image = key;
report.markModified('metadata');
await report.save();
```

Run with `node scripts/migrate-ioda-svg-to-storage.js`. Re-runnable (migrated docs hold a key, not `<…>`, so the filter skips them). **Verified on dev: 916 migrated, second run = 0.**

### 6. Remove the band-aid (after migration)

Once the channel writes keys and the migration has run, delete the `.select({ 'metadata.rawAPIResponse.image': 0 })` exclusion in `queryReportsDeduped` ([report.js](../../backend/models/report.js)). Documents are now tiny, so the key ships in list responses and the browser lazy-loads only visible charts via `<img>` — this is what restores charts in the feature branch's table/compare views.

### 7. Fix Cloudflare chart regression (found after merge)

The `imageUrl` work in §3–§4 is source-agnostic, but Cloudflare's `metadata.rawAPIResponse.image` is **not** an inline SVG — it's a remote Radar chart **URL** (`'image': image, // Store image as https url`, [cloudflare.js:312](../../backend/fetching/channels/cloudflare.js#L312), built from `API_LINKED_PAGE_URLS.CLOUDFLARE.IMAGE_ROUTE`). Two source-agnostic changes on this branch broke it:

- [TrafficEvent.tsx:20](../../src/components/SocialMediaPost/TrafficEvent.tsx#L20) switched the Cloudflare chart from `rawData?.image` (the real URL) to `rawData?.imageUrl`.
- `serializeReport` ([reportController.js:64-69](../../backend/api/controllers/reportController.js#L64)) only guards the inline-SVG shape (`startsWith('<')`); a Cloudflare URL falls through to `buildMediaUrl(image)`, which treats it as a relative media key and mangles it:

```
https://radar.cloudflare.com/.../png?image=true&...  ->  /media/https:/radar.cloudflare.com/.../png?image=true&...   (404)
```

So Cloudflare charts that worked pre-branch now 404 against the `/media` static mount.

**Fix** — make `serializeReport` handle the three shapes of `image`, not two:

```js
const rawAPIResponse = plainReport?.metadata?.rawAPIResponse;
const chartImage = rawAPIResponse?.image;
let imageUrl;
if (typeof chartImage === 'string') {
  const trimmed = chartImage.trimStart();
  if (trimmed.startsWith('<')) {
    imageUrl = undefined;                 // legacy inline SVG (pre-migration IODA) — leave as-is
  } else if (/^https?:\/\//i.test(trimmed)) {
    imageUrl = chartImage;                // absolute remote URL (Cloudflare Radar) — pass through unchanged
  } else {
    imageUrl = buildMediaUrl(chartImage); // relative media key (post-migration IODA) — resolve to /media/...
  }
}
const rawAPIResponseWithUrl =
  imageUrl != null ? { ...rawAPIResponse, imageUrl } : rawAPIResponse;
```

Optional defense-in-depth: `TrafficEvent.tsx` can fall back to `src={rawData?.imageUrl ?? rawData?.image}` (the original `image` URL still survives in the serialized payload). No change needed in `cloudflare.js` — it has no inline SVG to move.

### Optional / lower priority — delete chart on report deletion

Charts are bounded (one stable file per outage event, overwritten not appended), so the leak is small. If a report-delete path exists, call `deleteMediaByKey(report.metadata.rawAPIResponse.image)` there. Note and defer unless there's an existing cleanup hook to extend.

## Files to modify

- [backend/fetching/utils/socialImageStorage.js](../../backend/fetching/utils/socialImageStorage.js) — add + export `persistSvgChart`; also export `deleteMediaByKey`.
- [backend/fetching/channels/ioda.js](../../backend/fetching/channels/ioda.js) — persist SVG, store key in `raw.image`; cache the SVG string per linked page.
- [backend/api/controllers/reportController.js](../../backend/api/controllers/reportController.js) — emit `rawAPIResponse.imageUrl` in `serializeReport`; the guard must distinguish the three `image` shapes (inline SVG vs absolute URL vs relative key) so Cloudflare's remote URL isn't mangled (§7).
- [src/components/SocialMediaPost/IodaEvent.tsx](../../src/components/SocialMediaPost/IodaEvent.tsx) + [TrafficEvent.tsx](../../src/components/SocialMediaPost/TrafficEvent.tsx) — `<img src={imageUrl}>`.
- [src/api/reports/types.ts](../../src/api/reports/types.ts) — add `image`/`imageUrl` to `RawApiResponse`.
- [backend/models/report.js](../../backend/models/report.js) — remove list projection exclusion (last, after migration).
- New: [scripts/migrate-ioda-svg-to-storage.js](../../scripts/migrate-ioda-svg-to-storage.js) — one-off backfill.

## Verification

Done (verified on dev):
- **Migration:** **916 migrated, 0 skipped, 0 failed**; 917 files under `public/media/ioda/charts/`; **second run = 0** (filter skips migrated docs).
- **List size:** with the projection exclusion removed, `GET /api/report?alerts=true&page=0` returned **~90KB in 0.3s** (was 43MB/60s), each IODA result carrying the key + resolved `imageUrl`.
- **Media route:** `GET /media/ioda/charts/<sha1>.svg` → 200, `image/svg+xml`.
- **Typecheck:** `npx tsc --noEmit` clean.

Still to confirm:
- **Live fetch path:** watch the next IODA poll — a brand-new report's `metadata.rawAPIResponse.image` should be a key like `ioda/charts/<sha1>.svg` with the file on disk, and repeated polls of the same ongoing outage should **not** grow the file count under `ioda/charts/` (same key overwritten in place).
- **Frontend (visual):** report detail shows the chart, and the feature branch's alert table / compare modal render charts (lazy-loaded via `<img>`).
- **Cloudflare chart (§7):** a Cloudflare traffic-anomaly report renders its chart — the `<img src>` resolves to the `radar.cloudflare.com` URL, not a mangled `/media/https:/…` path (404).
