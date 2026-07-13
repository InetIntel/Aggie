# TODO

Running list of notable behaviors and follow-ups to pick up later. Items below were
consolidated here from finished plan docs (the completed plans were removed); each carries
enough context to act on without the original doc.

---

## Backend

### `saveToDatabase` deletes attachments on every duplicate

**Status:** Notable behavior to review — not yet fixed.

In the FETCH pipeline's save hook, [backend/fetching/hooks/saveToDatabase.js](../../../backend/fetching/hooks/saveToDatabase.js),
the `catch` block runs `deleteSocialAttachments(report?.metadata?.attachments)` on **every** failed
`Report.create(...)` — including the very common case where the failure is a duplicate-key error.

```js
// saveToDatabase.js
const result = await Report.create(report);   // line 9
...
} catch (error) {
  await deleteSocialAttachments(report?.metadata?.attachments);   // runs on EVERY failure, before the 11000 branch
  if (error.code === 11000) { /* quiet log */ } else { /* error log */ }
}
```

The E11000 logging was already quieted (dedup logs as `console.log`, not `console.error`), but the
**unconditional delete still runs on duplicates**. The duplicate case is frequent and expected:
`report.js:28` declares a unique index on `guid`, and the fetcher re-polls sources on a loop, so any
already-saved item is re-fetched and rejected with `E11000 duplicate key error ... guid_1`.

**Why it's notable / risk:** on each duplicate, the delete removes the **re-fetched** item's
attachments. Usually fine (freshly downloaded temp files for the rejected insert), **but** if
attachment storage paths ever collide with the already-saved report's paths, this could delete image
files the persisted report still references. Needs verification of how `deleteSocialAttachments`
resolves paths.

**Suggested fix:** detect `error.code === 11000` and, for that case, **skip** `deleteSocialAttachments`
(keep it only for genuine save failures).

Files:
- [backend/fetching/hooks/saveToDatabase.js](../../../backend/fetching/hooks/saveToDatabase.js) — the hook
- [backend/models/report.js:28](../../../backend/models/report.js#L28) — unique `guid` index
- [backend/fetching/utils/socialImageStorage.js](../../../backend/fetching/utils/socialImageStorage.js) — `deleteSocialAttachments` (verify path resolution)

### Delete the IODA chart file when a report is deleted

**Status:** Not done — optional / low priority (leftover from the completed IODA-SVG→media-storage move).

IODA charts now live on disk as `public/media/ioda/charts/<sha1(guid)>.svg` (one stable file per
outage event, overwritten in place on re-fetch, not appended), with only the media key stored at
`metadata.rawAPIResponse.image`. The leak is bounded, but there's no cleanup on report deletion.

**If a report-delete path exists**, call `deleteMediaByKey(report.metadata.rawAPIResponse.image)`
there (`deleteMediaByKey` is already exported from
[backend/fetching/utils/socialImageStorage.js](../../../backend/fetching/utils/socialImageStorage.js)).
Defer unless there's an existing cleanup hook to extend.

### Index/query optimization for the entityLevel-filtered alerts query

**Status:** Not done. The 60s alerts-timeout it originally addressed is already resolved (by moving
the ~330KB IODA SVG out of documents into media storage), so this is now a **query-planning
optimization**, not an outage fix. Still worthwhile because both the deduped and non-dedup
(`hideDuplicateASNs=false`) paths filter on `metadata.rawAPIResponse.entityLevel` — a nested field of
a `Schema.Types.Mixed` column with **no index** — plus `isOutageEvent`, so both can do full scans.

1. **Add two compound indexes** in [backend/models/report.js](../../../backend/models/report.js) after
   the existing `schema.index(...)` block (Mongoose 5 syntax, `background: true`):
   ```js
   schema.index({ isOutageEvent: 1, 'metadata.rawAPIResponse.entityLevel': 1, authoredAt: -1 }, { background: true });
   schema.index({ isOutageEvent: 1, 'metadata.rawAPIResponse.entityLevel': 1, eventIdentifier: 1 }, { background: true });
   ```
   ESR rationale: equality on `isOutageEvent` + `entityLevel`, then sort (`authoredAt`) for the find;
   trailing `eventIdentifier` lets the dedup `$group` be served from index. Index (b) must **NOT** be
   sparse — the count's `$cond` group key falls back to `$_id` for docs lacking `eventIdentifier`, so
   all matching docs must be indexed. Indexing a dotted path into a Mixed field is valid.
   On Atlas, also build them via `mongosh` (rolling, non-blocking) with the **exact** same key
   order/direction so `ensureIndexes` on restart is a no-op.

2. **Drop the redundant `$exists` predicate** in
   [backend/models/query/report-query.js](../../../backend/models/query/report-query.js#L126-L145).
   The `entityLevel` (~L133-145) and `dataSources` (~L126-132) blocks each push a separate
   `{ '<field>': { $exists: true } }` clause that is implied by the value/`$in` clause and degrades
   plan selection. Simplify each block to just the value clause (`this.x.length === 1 ? this.x[0] : { $in: this.x }`).

3. **Add `.allowDiskUse(true)`** to the dedup count aggregate in `queryReportsDeduped`
   ([report.js](../../../backend/models/report.js)) as a safety net against the 100MB in-memory group limit.

Verify with `db.reports.find(<filter>).sort({authoredAt:-1}).explain("executionStats")` and the count
aggregate's `.explain()` → expect `IXSCAN`, low `totalDocsExamined`.

### `rawFetchLimit = targetUnique * 2` dedup heuristic

**Status:** Known limitation, not addressed.

In `queryReportsDeduped` ([backend/models/report.js](../../../backend/models/report.js)) the raw fetch
limit is `targetUnique * 2`. When **>half** the fetched rows are duplicates, deep pages come back
short while `total` still promises more — pagination can under-fill. Revisit if deep-page correctness
matters (e.g. iterate/refetch until the page is filled, or compute the limit from the observed dup ratio).

### Investigate: Cloudflare alerts not showing in the alerts list (only IODA)

**Status:** Open question — worth checking. Only IODA alerts appear in the alerts list; Cloudflare
outage/traffic-anomaly reports seem absent even though the channel ingests them. Confirm whether it's
a filter (`isOutageEvent`/`entityLevel`), a fetch issue, or a rendering issue.

---

## Frontend / UI

### Incidents compare modal — surface signal-source badges

**Status:** Not done (leftover from the completed table-views/compare work).

[src/pages/incidents/TableView/CompareIncidentCard.tsx](../../../src/pages/incidents/TableView/CompareIncidentCard.tsx)
should surface the **signal source(s)** of the incident's member reports — the datasource badges
(BGP / Active Probing / Telescope) drawn from each report's
`metadata.rawAPIResponse.rawEvent.datasource`, as shown in the alerts table's Signal column. Reuse the
badge styling from `SignalCell` in
[src/pages/Reports/TableView/reportColumns.tsx](../../../src/pages/Reports/TableView/reportColumns.tsx).
Likely an aggregate of distinct datasource values across the group's `_reports`.

### Make incident compare cards match the alert compare cards

**Status:** Not done. The incident compare cards
([CompareIncidentCard.tsx](../../../src/pages/incidents/TableView/CompareIncidentCard.tsx)) are a
simpler read-only summary; bring their look/structure in line with the richer alert cards
([CompareAlertCard.tsx](../../../src/pages/Reports/TableView/CompareAlertCard.tsx)).

### Alerts table — design-debt polish pass

**Status:** Functional but not visually finished (it was iterated quickly to kill horizontal-overflow
bugs). Needs a deliberate design pass before it's "done". Specifics:

- **Icon-only actions rely on tooltips.** The four per-row actions (Read/Unread · Ignore · Investigate ·
  Add to Incident) are icon-only in the action bar; meaning depends on hover `title`/`aria-label`.
  Consider labels or a clearer affordance (or an overflow menu).
- **Action bar adds height.** The full-width "More ▾" bar under every row makes the table less dense.
  Revisit if density matters.
- **Aggressive column shrinking looks rough.** Content uses `[overflow-wrap:anywhere]`, Source/Incident
  `truncate` with small `max-w`, trimmed width hints (`w-24`/`w-28`/`w-32`). Functional but visually rough.
- **Inline detail styling is provisional.** The expanded `ReportDetail` reuses the standalone detail
  layout as-is inside the expand row; framing/spacing not designed for that context.
- **Bounded scroll card.** `DataTable` card is `overflow-auto max-h-[75vh]` (for the sticky header); the
  `75vh` cap is a guess — revisit if it leaves awkward empty space or feels cramped.
- **Responsive buckets are best-effort.** Breakpoints were hand-tuned to avoid overflow, not chosen for
  information priority — reconsider which columns matter most and when they appear.
- **Add alert images.** When the user expands "More Info", also include the source image.

Files: [src/components/DataTable/DataTable.tsx](../../../src/components/DataTable/DataTable.tsx),
[src/pages/Reports/TableView/reportColumns.tsx](../../../src/pages/Reports/TableView/reportColumns.tsx),
[src/pages/Reports/TableView/ReportsTable.tsx](../../../src/pages/Reports/TableView/ReportsTable.tsx).

### Incidents table — small layout bugs

- **Status column header overlaps the title** around ~600px width — unresolved.
- **"N reports" subline** text is very small; bump the size.

File: [src/pages/incidents/TableView/IncidentsTable.tsx](../../../src/pages/incidents/TableView/IncidentsTable.tsx).

---

## Future options (decided against for now)

### Browser-free IODA chart rendering

**Decision so far:** keep the Playwright/Chromium scrape of the IODA dashboard SVG
([backend/fetching/utils/iodaUtils.js](../../../backend/fetching/utils/iodaUtils.js) `extractCleanSVGFromPage`).
The IODA v2 API has **no chart-image endpoint** (no server-rendered SVG/PNG to fetch), so a URL swap
isn't possible. If the scrape ever becomes a maintenance burden, the data behind the chart *is*
available directly:

```
GET https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/{entityType}/{entityCode}
      ?from={unixSeconds}&until={unixSeconds}&datasource={bgp|merit-nt|ping-slash24|gtr|...}&maxPoints={n}
```

(returns chart time-series JSON — verified HTTP 200). Two browser-free alternatives it unlocks:
1. **Frontend render** — store the compact time-series JSON on the report, render a React chart
   component. Removes Playwright, jsdom, DOMPurify, **and** the media-storage SVG machinery.
2. **Server-side SVG render** — render an SVG on the backend (Highcharts export server or a light
   renderer), keep the existing `/media` storage + `<img>` path.

Trade-off either way: the scrape gets a pixel-perfect chart for free; rendering ourselves means
reproducing IODA's Highcharts config and maintaining it as their dashboard evolves.

---

## General notes / fixes

- need to figure out which items in alerts and incidents are most important to users to prioritize as table resizes
- need to handle adding alerts to incidents better. ex: when an alert is already added to an incident, it can't be added to a second incident. would one alert ever be added to multiple incidnets? if adding to different incident, the user must be informed that it will override the first incident the alert is associated with.
- create new incident needs a back button or an x. can this just get turned into a modal?
- compare modal needs some work for more than 3 items and it needs to normalize the height and width of the items in the modal
