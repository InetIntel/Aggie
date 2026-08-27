# TODO

Running list of notable behaviors and follow-ups to pick up later. Items below were
consolidated here from finished plan docs (the completed plans were removed); each carries
enough context to act on without the original doc.

> **Branch record.** Work that **shipped** on `feat/incident-alert-filtering` is documented in
> [incidents-alerts-filtering.md](incidents-alerts-filtering.md) (filtering Workstreams A–D +
> the "Other work shipped on this branch" section). One plan doc remains standalone because it did
> **not** ship: [cloudflare-chart-caching.md](cloudflare-chart-caching.md) (design-only). The
> unshipped assign-user crash and IODA recovery tracking (Workstream D) are tracked inline in this
> file (see *General notes / fixes* and *IODA recovery tracking* below).

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
- **Alert date filtering does not work.** Need to fix.
- **Enable alert filtering by hours.** I want to see alerts from the past 1-12 hours.
- **Creating new incident from alerts and hitting cancel closes compare modal.** Ensure that compare modal / alerts in modal persist.

Files: [src/components/DataTable/DataTable.tsx](../../../src/components/DataTable/DataTable.tsx),
[src/pages/Reports/TableView/reportColumns.tsx](../../../src/pages/Reports/TableView/reportColumns.tsx),
[src/pages/Reports/TableView/ReportsTable.tsx](../../../src/pages/Reports/TableView/ReportsTable.tsx).

### Alerts / Incidents re-render performance (backlog)

**Status:** Not done. The perf steps (1–6) were implemented and then **reverted** once the
real "hard refresh" cause turned out to be the CRA dev-server reloading on `public/media`
writes (fixed via `MEDIA_ROOT`; see the *Alerts reload / re-render fix* subsection in
[incidents-alerts-filtering.md](incidents-alerts-filtering.md#other-work-shipped-on-this-branch-consolidated)).
The re-render *drivers* below are real but were never the reload cause — pursue as a separate perf PR:

- **`react-time-ago` per-row tickers** on Alerts rows self-update ~1s and look like constant list thrash ([src/components/DateTime.tsx](../../../src/components/DateTime.tsx)).
- **Socket-listener re-bind churn** — `useSocketSubscribe` depends on `[eventHandler]` and the handler is redefined each render, so it tears down/re-adds the listener every render (console spam) on both pages. Fix: wrap handlers in a stable `useEventCallback`/`useCallback` ([src/pages/Reports/index.tsx](../../../src/pages/Reports/index.tsx), [src/pages/incidents/index.tsx](../../../src/pages/incidents/index.tsx), [src/hooks/WebsocketProvider.tsx](../../../src/hooks/WebsocketProvider.tsx)).
- **`isFetching` + focus + interval pulses** — `refetchInterval: 120000` + v4 `refetchOnWindowFocus` default + StrictMode dev double-render. Consider `refetchOnWindowFocus: false` + `keepPreviousData`.
- **Whole-list cache replacement** — a socket `reports:update`/`groups:update` rebuilds the list with a new array/object ref even when no changed id is on the page, re-rendering every (unmemoized) row. Fix: `React.memo` rows with stable props, and/or skip `setQueryData` when ids don't intersect the page.
- **Scroll/selection loss on nav** (alerts only) — the mount reset effect scrolls to top and wipes selection without a POP guard or scroll save/restore (incidents already does this right — mirror it).

### Incidents table

#### Incidents table features

- **Sankey diagram for impacted ASNs** https://ainita.net/iran-internet-map/

#### Incidents table small layout bugs

- **Status column header overlaps the title** around ~600px width — unresolved.
- **"N reports" subline** text is very small; bump the size.

File: [src/pages/incidents/TableView/IncidentsTable.tsx](../../../src/pages/incidents/TableView/IncidentsTable.tsx).

### Connections / Feeds ("Providers and Feeds") polish

**Status:** Not done (migrated from the shipped `connections-page.md` design doc). Follow-ups on the
consolidated Connections page ([src/pages/Settings/Connections/](../../../src/pages/Settings/Connections/)):

- In add/edit feed — if "only allow 1 connection" is toggled on, default to that connection and don't let the user change it.
- In view details, collapse recent activity behind an expand toggle; put the "X warnings" toast inline with the eyebrow header.
- Connect and explore the Mastodon provider.
- The "More" button doesn't match the look/feel of the button used in Feed — reconcile.
- In the view-details modal, the connection is clickable but does nothing; don't change the cursor on hover.
- Figure out what tags are on the feed form.
- Change feed copy — it references "reports"; should be "alerts".
- Document what the different Telegram-form inputs mean.
- Take screenshots of the former user flow before deploying.
- Make the Mastodon hashtag explanation text less AI-sounding.
- Rename Mastodon "hashtag" to "hashtags" in the feeds page when multiple are allowed.
- In Mastodon feeds, the feed type shows the connection on top of the mode — remove it (already in the key toast); keep just the mode. Do the same for Cloudflare and IODA.
- Make the "Enable fetching" text smaller.
- Capitalize "Provider" like Feeds/Alerts/Connections are capitalized.
- Remove the Style page from the dropdown menu.
- Change the page title from "Feeds" to "Providers and Feeds"; base the explanation text on what a provider is, then a connection, then a feed.

### Incidents / alerts filtering

- **Incident:**
  - sort is by currently incident number
    - Want to be able by start time
    - Want to filter by start time
    - On all card view —> have tags that indicate the source of the reports associated with the incident
  - Statuses:
    - Is currently a carryover from elections
    - What does escalation mean in this new Aggie context?
    - Need to hash out other statuses to ensure they make sense in an Aggie
- **Alerts**:
  - date filter filter does not work: need to fix
  - IODA API has alerts, event API and they’re all related (need to investigate)
    - We are not storing recovery, we are just storing an end time

---

## IODA recovery tracking (Workstream D — not started)

**Status:** Not started (migrated from `incidents-alerts-filtering.md`, which is now the shipped-only
record for Workstreams A–C). Distinguish an *ongoing* outage from a *recovered* one — not just a
computed end time — at both the report/alert level and the incident that aggregates reports (an
incident with any still-ongoing member must show "ongoing", not a misleading end time).

**API basis (verified against live `https://api.ioda.inetintel.cc.gatech.edu/v2/`).** Aggie already
fetches the **events** endpoint; each event carries **`overlaps_window`** — the ongoing signal:
`false` = the event closed inside the queried window (recovered); `true` = it reaches/exceeds `until`
and IODA is still observing it. `duration` grows across fetches until IODA closes it. Derive recovery
from `overlaps_window` alone — no second (alerts) endpoint call needed.

1. **Recovery signal (in `parseEvent`)** — compute alongside `eventEndedAtSeconds`
   ([ioda.js:288-296](../../../backend/fetching/channels/ioda.js#L288-L296)): `isOngoing = overlaps_window === true || eventEndSeconds >= fetchToTimestamp - RECOVERY_GRACE_SECONDS` (grace ~15 min > IODA's ~5-min cadence); `outageStatus = isOngoing ? 'ongoing' : 'recovered'`; `recoveredAt = isOngoing ? null : new Date(eventEndSeconds*1000)`.
2. **Schema** ([report.js:19-21](../../../backend/models/report.js#L19-L21), Mongoose 5) — keep `outageEndedAt`; add `outageStatus: { type: String, enum: ['ongoing','recovered'], default: 'ongoing', index: true }` and `recoveredAt: { type: Date, default: null }`. Add index `schema.index({ isOutageEvent: 1, outageStatus: 1, authoredAt: -1 })`. Semantics: `outageEndedAt` = `start+duration`, advances each fetch while ongoing ("last seen bad"); `recoveredAt` non-null only once IODA confirms closure.
3. **Parse + dedup-update** ([ioda.js](../../../backend/fetching/channels/ioda.js)) — set `post.outageStatus`/`post.recoveredAt` in `parseEvent`. In the existing-report update block ([ioda.js:179-206](../../../backend/fetching/channels/ioda.js#L179-L206)): **latch** to recovered (never revert), set `recoveredAt` once on transition; while `overlaps_window` stays true leave status `ongoing` and let `outageEndedAt` advance. Trigger `recomputeIncidentDurationForGroups` on status-flip too, not just `endChanged`.
4. **Migration** — `default:'ongoing'` is wrong for historical closed events, so backfill: for `isOutageEvent:true` docs with past `outageEndedAt`, set `outageStatus:'recovered'`, `recoveredAt = $outageEndedAt`. Group `incidentOngoing` default `false` is already correct for historical incidents. Run as a one-off migration script.
5. **Downstream** — `serializeReport` spreads the whole report so `outageStatus`/`recoveredAt` auto-expose (no serializer change). Optional: `outageStatus` query filter + an "Ongoing/Recovered" badge in the alerts UI (defer the badge to the alerts design-polish pass).
6. **Propagate to the incident (required)** — group schema ([group.js:67-69](../../../backend/models/group.js#L67-L69)): add `incidentOngoing: { type: Boolean, default: false, index: true }`. In `incidentDuration.js` extend the report `.select(...)` to include `outageStatus`, derive `anyOngoing = reports.some(r => r.isOutageEvent && r.outageStatus === 'ongoing')`, set `group.incidentOngoing = anyOngoing`; when ongoing force `incidentEndedAt = null` and `incidentDurationSeconds = null`, keep `incidentStartedAt`. Frontend ([src/api/groups/types.ts](../../../src/api/groups/types.ts): add `incidentOngoing?: boolean`): in card view ([IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx)) and table Date column ([IncidentsTable.tsx](../../../src/pages/incidents/TableView/IncidentsTable.tsx)) render an "Ongoing" pill in place of the end timestamp when `incidentOngoing`.

**Verify.** Report level: an ongoing IODA outage stores `outageStatus:'ongoing'`, `recoveredAt:null`, `outageEndedAt` advancing on re-fetch; after IODA closes it, a later fetch flips to `'recovered'` with `recoveredAt` set and does not revert. Incident level: adding an ongoing report shows "Ongoing" (no end) in both views; once it recovers the next recompute sets `incidentOngoing:false` and the real end/duration appear.

**Files:** [backend/models/report.js](../../../backend/models/report.js), [backend/fetching/channels/ioda.js](../../../backend/fetching/channels/ioda.js), [backend/api/utils/incidentDuration.js](../../../backend/api/utils/incidentDuration.js), [backend/models/group.js](../../../backend/models/group.js), [src/api/groups/types.ts](../../../src/api/groups/types.ts), [src/pages/incidents/IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx), [src/pages/incidents/TableView/IncidentsTable.tsx](../../../src/pages/incidents/TableView/IncidentsTable.tsx), [backend/api/controllers/reportController.js](../../../backend/api/controllers/reportController.js) (optional filter/serialize).

---

## Future options (decided against for now)

### Browser-free IODA chart rendering

**Decision so far:** keep the Playwright/Chromium scrape of the IODA dashboard SVG
([backend/fetching/utils/iodaUtils.js](../../../backend/fetching/utils/iodaUtils.js) `extractCleanSVGFromPage`).
The IODA v2 API has **no chart-image endpoint** (no server-rendered SVG/PNG to fetch), so a URL swap
isn't possible. If the scrape ever becomes a maintenance burden, the data behind the chart _is_
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

- **Live bug — assigning a user to an incident crashes** with `Cannot use 'in' operator to search for 'username'` (**not yet shipped**; migrated here from `fix-assign-user-in-operator-crash.md`).

  **Root cause.** `Group.assignedTo` is normally a populated `{ _id, username }[]`, but the edit-incident form stores it as `string[]` of user ids ([CreateEditIncidentForm.tsx:82](../../../src/pages/incidents/CreateEditIncidentForm.tsx#L82); `GroupEditableData.assignedTo: string[]`). On save, `doUpdate.onSuccess` does an optimistic cache update that spreads the raw form variables over the cached group ([useIncidentMutations.ts:31-39](../../../src/pages/incidents/useIncidentMutations.ts#L31)), overwriting the populated user objects with bare id strings. The table then re-renders and `formatAssignedTo` ([IncidentsTable.tsx:37](../../../src/pages/incidents/TableView/IncidentsTable.tsx#L37), `"username" in u`) applies `in` to a string → throws (`onSettled` refetch fixes the cache, but the synchronous re-render crashes first).

  **Fix (two parts).**
  1. **Resolve ids → user objects in `doUpdate`** (root cause). In [useIncidentMutations.ts](../../../src/pages/incidents/useIncidentMutations.ts), make `doUpdate.onSuccess` resolve `variables.assignedTo` (string ids) into populated user objects before writing to cache, mirroring the existing `doSetAssign.onSuccess` pattern ([useIncidentMutations.ts:88-109](../../../src/pages/incidents/useIncidentMutations.ts#L88)) that uses the `users` query already loaded in the hook — override `assignedTo` in the `{ ...variables }` spread with `variables.assignedTo?.map(id => users?.find(u => u._id === id) ?? { _id: "", username: "User not found" })`.
  2. **Harden `formatAssignedTo`** (defense in depth) in [IncidentsTable.tsx](../../../src/pages/incidents/TableView/IncidentsTable.tsx): tolerate string entries via lodash `isString` (map strings to `""` and filter out), reusing the same approach as `IncidentListItem.getUserId` ([IncidentListItem.tsx:104-108](../../../src/pages/incidents/IncidentListItem.tsx#L104)).

  No type or API changes needed. **Verify:** `/incidents?view=table` → edit an incident, assign users, Update → no crash, usernames show immediately (optimistic) and after refetch; clearing all assignees shows `—`; `npx tsc --noEmit` clean.
- need to figure out which items in alerts and incidents are most important to users to prioritize as table resizes
- need to handle adding alerts to incidents better. ex: when an alert is already added to an incident, it can't be added to a second incident. would one alert ever be added to multiple incidents? if adding to different incident, the user must be informed that it will override the first incident the alert is associated with.
- create new incident needs a back button or an x. can this just get turned into a modal?
- compare modal needs some work for more than 3 items and it needs to normalize the height and width of the items in the modal

- instead of Open, Closed, All, and "Show Only Escalated" change to Verification Stage, Confirmation Stage, Published
- automatically sort by start time and add start time as a filter
- Automatically see which sources have reports assigned to an incident in the incident table with a tag sort of visual - enables users to quickly see if an incident is visible in both ioda and cloudflare or just one.

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
   schema.index(
     {
       isOutageEvent: 1,
       "metadata.rawAPIResponse.entityLevel": 1,
       authoredAt: -1,
     },
     { background: true },
   );
   schema.index(
     {
       isOutageEvent: 1,
       "metadata.rawAPIResponse.entityLevel": 1,
       eventIdentifier: 1,
     },
     { background: true },
   );
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
