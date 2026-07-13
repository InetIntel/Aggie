# Fix: reports query timeout → ERR_HTTP_HEADERS_SENT double-send (+ slow dedup query, noisy E11000 log)

## Why this is happening now

Nothing on the current branch caused it. `queryReportsDeduped` and its bugs (double-callback, per-document `$group` count) landed in `4f66ac4d` on 2026-03-19; the branch's backend commits (mastodon, telegram, media serving) don't touch the query path. The failure is load/data-dependent:

- Every reports/alerts list load re-runs the count aggregate, which hashes **every matched document**. The reports collection grows continuously (IODA/Cloudflare/social fetchers), so this query gets slower every week — it has now started crossing the 60s `API_REQUEST_TIMEOUT` line.
- It's worst exactly when fetching is busy writing (the E11000 in the same log window shows the fetcher mid-save), since the aggregate competes with insert load.
- Once the 60s line is crossed, the latent double-callback bug turns a plain timeout into the `ERR_HTTP_HEADERS_SENT` crash log. Expect it to recur with increasing frequency until the perf fix lands.

## Context

Two recurring backend errors:

```
[Fetching-saveToDatabase] Failed - Failed saving reports: E11000 duplicate key error ... index: guid_1 ...
Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
    at handler (backend/api/controllers/reportController.js:107)
    at Report.queryReportsDeduped (backend/models/report.js:340)
```

These are unrelated to the earlier assign-user frontend crash. The chain behind the headers-sent error:

1. `GET /api/report` (most reports/alerts list loads — `shouldDedupByEventIdentifier` returns true whenever there's no `entityLevel`/`groupId` filter) runs `Report.queryReportsDeduped` ([backend/models/report.js:264-342](backend/models/report.js#L264)).
2. That function runs a `find` (sorted by `authoredAt`, limited) **then sequentially** a count aggregate whose `$group` builds a hash entry per matched document — slow on a large collection. With the current indexes the alerts filter (`{isOutageEvent: true, irrelevant: {$ne:'true'}}` + sort `authoredAt: -1`) forces either an in-memory sort of all outage docs or a residual walk of the `authoredAt` index. The request exceeded `API_REQUEST_TIMEOUT=60000`.
3. The timeout middleware ([backend/api.js:117-144](backend/api.js#L117)) sends `res.sendStatus(500)`.
4. The query later completes → `callback(null, results)` → controller handler calls `res.send` → throws `ERR_HTTP_HEADERS_SENT` → **the `try/catch` in `queryReportsDeduped` catches the callback's own throw and invokes `callback(err)` a second time** → second `res.send` throws again → the logged crash.

The E11000 log is separate and mostly benign: a channel re-fetched a post whose `guid` already exists; the unique index correctly rejects it and `saveToDatabase` ([backend/fetching/hooks/saveToDatabase.js](backend/fetching/hooks/saveToDatabase.js)) cleans up the duplicate's freshly-uploaded attachments (keys are `crypto.randomBytes`-derived, so no collision with the original's files). It just logs expected dedup as a scary error.

User chose scope: **error handling + perf**.

## Changes

### 1. `backend/models/report.js` — `queryReportsDeduped` (lines ~264-342)

**a. Single-invoke callback.** Restructure so the callback can never fire twice: do all async work inside `try`, capture the result, and call `callback` exactly once _after_ the try/catch (`catch` does `return callback(err)`). With `Promise.all` (below), the guard wraps the combined await — not each promise.

**b. Parallelize + bound the two DB ops.**

- `Report.find(filter).sort({ authoredAt: -1 }).limit(rawFetchLimit).maxTimeMS(30000).lean()`
- count aggregate with `.option({ maxTimeMS: 30000 })`
- run both via `Promise.all`. (APIs verified on installed mongoose 5.13.23: `Query#maxTimeMS`, `Aggregate#option`.) A query that's still slow now fails at ~30s with `MaxTimeMSExpired` → one clean 500, no race with the 60s middleware.

**c. Fix + cheapen the count aggregate.** The current `$cond` on `$type ne 'missing'` collapses all `eventIdentifier: null` docs into one group (and `''` docs into another) while the in-JS dedup at line 299 keeps every `!key` doc — so `total` undercounts vs. results, and the `'$_id'` fallback gives the `$group` one hash entry per doc. Replace with a two-stage group matching the JS `!key` semantics exactly, bounded by (#distinct events + 1):

```js
const [{ total = 0 } = {}] = await Report.aggregate([
  { $match: filter },
  {
    $group: {
      _id: {
        $cond: [
          { $in: [{ $ifNull: ["$eventIdentifier", null] }, [null, ""]] },
          null,
          "$eventIdentifier",
        ],
      },
      c: { $sum: 1 },
    },
  },
  {
    $group: {
      _id: null,
      total: { $sum: { $cond: [{ $eq: ["$_id", null] }, "$c", 1] } },
    },
  },
  { $project: { _id: 0, total: 1 } },
]).option({ maxTimeMS: 30000 });
```

**d. Compound index** near the existing `schema.index(...)` block (~line 67):

```js
schema.index({ isOutageEvent: 1, authoredAt: -1 });
```

Serves the common alerts-view match + sort + limit directly (`irrelevant: {$ne:'true'}` stays a cheap residual filter; deliberately NOT in the index — `$ne` on a prefix key forfeits the index-provided sort). Indexes are ensured via `install.js` → `Report.ensureIndexes` (runs on `postinstall`; can also be triggered manually).

Leave a `// TODO` on the `rawFetchLimit = targetUnique * 2` heuristic: when >half the fetched rows are duplicates, deep pages come back short while `total` promises more. Out of scope here.

### 2. `backend/api/controllers/reportController.js` — `handler` (lines ~106-109)

Defense in depth — never write after the timeout middleware has responded:

```js
const handler = (err, reports) => {
  if (res.headersSent) {
    if (err)
      console.error(
        "report_reports: response already sent, dropping late error:",
        err.message,
      );
    return;
  }
  if (err) return res.status(err.status || 500).send(err.message);
  return res.send(serializeReportResponse(reports));
};
```

### 3. `backend/fetching/hooks/saveToDatabase.js` — quiet expected duplicates

In the `catch`, branch on `error.code === 11000`: keep the attachment cleanup, but log it as expected dedup (e.g., `console.log('[Fetching-saveToDatabase] Skipped duplicate report (guid already saved): ...')`) instead of the `Failed saving reports` error. All other errors keep the current error log.

## Files to modify

- [backend/models/report.js](backend/models/report.js) — single-invoke callback, `Promise.all` + `maxTimeMS`, replacement count pipeline, compound index.
- [backend/api/controllers/reportController.js](backend/api/controllers/reportController.js) — `res.headersSent` guard in `handler`.
- [backend/fetching/hooks/saveToDatabase.js](backend/fetching/hooks/saveToDatabase.js) — downgrade E11000 log.

No frontend or API-shape changes (`{ total, results }` unchanged).

## Verification

- Rebuild indexes: `node install.js` (or restart with postinstall) — confirm `isOutageEvent_1_authoredAt_-1` exists via `db.reports.getIndexes()`.
- `npm run dev`, load `https://localhost:8000/` reports and alerts views — lists load, pagination totals sane, and noticeably faster on the alerts view; check Mongo with `.explain()` on the find shape if needed (expect IXSCAN on the new compound index).
- Reproduce the timeout path: temporarily set `API_REQUEST_TIMEOUT=1` in `.env`, hit `/api/report` — expect a single 500 and **no** `ERR_HTTP_HEADERS_SENT` in the backend log; restore the value after.
- Count-vs-results consistency: with reports lacking `eventIdentifier` in the DB (normal social reports), confirm `total` ≥ number of listed unique rows and page count matches what's fetchable.
- Let fetching run across a refetch window: duplicate guids now log as a one-line skip, not a `Failed` error; attachments for duplicates still cleaned (no orphan files accumulating under the media root).

---

## Addendum (implemented): the real payload culprit + follow-up

Verification against the dev Atlas cluster showed the index and count pipeline were never the bottleneck (find ids: 150ms, count: 56ms). The alerts list was timing out because **every IODA report stores a ~330KB scraped SVG chart inline at `metadata.rawAPIResponse.image`** ([backend/fetching/channels/ioda.js:398](../../backend/fetching/channels/ioda.js#L398)) — one page of the dedup query fetched 100 full docs ≈ 43MB, ~7 minutes of transfer. `maxTimeMS` can't help; it bounds server execution, not result transfer.

**Implemented now:** the dedup list query excludes that field (`.select({ 'metadata.rawAPIResponse.image': 0 })` in `queryReportsDeduped`). Alerts page 0 went from a 60s timeout to ~2s / 83KB. The single-report endpoint still returns the image, so the report detail view keeps its chart. The projection was deliberately NOT applied to `findSortedPage`/`queryReports` because the `groupId` (incident detail) path renders full `SocialMediaPost` cards that need the chart.

**Known gaps / follow-up (separate branch):**

- Move the SVG out of the document into media storage (reuse `backend/fetching/utils/socialImageStorage.js` + `serializeReport` URL emission), update `IodaEvent`/`TrafficEvent` to `<img src={url}>`, and migrate the ~1000 existing IODA reports. That restores charts in any list-driven UI (e.g., the feature branch's alert table/compare modal, which read from the list response and currently won't have the inline SVG) and shrinks the collection.
- `hideDuplicateASNs=false` forces the non-dedup path (`queryReports`), which still fetches full docs — slow again with many IODA reports until the media-storage move lands.
- Verified behavior of the error-handling fix: `aggie-api` survived repeated 60s timeouts without the previous crash-loop (it used to die on the unhandled `ERR_HTTP_HEADERS_SENT` and get respawned by process-manager).
