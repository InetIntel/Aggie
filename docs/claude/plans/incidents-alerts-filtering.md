# Incidents / Alerts Filtering Enhancements

## Context

The **Incidents / alerts filtering** section of [todo.md](todo.md#L180-L194) collects usability gaps that surfaced after the elections→Aggie (internet-outage) pivot. This plan tackles them as four independent workstreams. Product decisions confirmed with the user:

- **Statuses/escalation** → **deferred** (out of scope here; the dormant `status` enum and the escalated/closed model are left untouched, to be redesigned in a separate discussion).
- **Alerts date filter** → keep filtering by **outage start time** (`authoredAt`) but **fix** it (it silently under/over-reports) and label it clearly.
- **IODA recovery** → **implement recovery tracking** (distinguish an ongoing outage from a recovered one, not just a computed end time).
- **Incident start time** → **add a start-time filter**, keep the current default sort (start-time *sort* already exists and is exposed in both views).

Each workstream below is self-contained and can ship independently.

---

## Workstream A — Alerts date filter fix (outage start time)

**Problem.** The alerts table date filter sets `before`/`after` params ([ReportsFilters.tsx:243-248](../../../src/pages/Reports/components/ReportsFilters.tsx#L243-L248) → `FilterDateTime`, value is an ISO string from `date.toISOString()`). The backend applies them to `authoredAt` in [report-query.js:70-71](../../../backend/models/query/report-query.js#L70-L71):

```js
if (this.before) filter.authoredAt = { $lte: this.before }          // this.before is a STRING
if (this.after)  filter.authoredAt = Object.assign({}, filter.authoredAt, { $gte: this.after });
```

The alerts list is served by the **deduped** path (`queryReportsDeduped`, [report.js:278-388](../../../backend/models/report.js#L278-L388)), which runs both a `Report.find(filter)` (Mongoose **casts** the ISO string → `Date`, so the visible list *is* filtered) **and** a `Report.aggregate([{ $match: filter }, …])` for the `total` count. **Mongoose aggregation does NOT cast `$match`**, so the count compares the `Date` field against a raw string and ignores the date bound — `total` is wrong, so pagination shows phantom/empty pages and the filter reads as "not working."

**Fix.**
1. Cast the bounds to `Date` where the filter is built so both `find` and `aggregate` agree — [report-query.js:70-71](../../../backend/models/query/report-query.js#L70-L71):
   ```js
   if (this.before) filter.authoredAt = { $lte: new Date(this.before) };
   if (this.after)  filter.authoredAt = Object.assign({}, filter.authoredAt, { $gte: new Date(this.after) });
   ```
   (Guard against invalid dates — skip the clause if `isNaN(d.getTime())`.)
2. Clarify the control. `FilterDateTime` hard-codes the label `"Date Range"` ([FilterDateTime.tsx:39](../../../src/components/filters/FilterDateTime.tsx#L39)). Add an optional `label`/`title` prop and pass e.g. `"Outage start"` from the alerts `ReportsFilters` so users know it filters on outage start time, not ingest time. Also remove the stray `console.log(beforeDate)` at [FilterDateTime.tsx:20](../../../src/components/filters/FilterDateTime.tsx#L20).

**Verify.** With a known outage set, run `db.reports.find({isOutageEvent:true, authoredAt:{$gte: ISODate(...)}}).count()` and compare to the alerts table `total` after applying the same after-date; they should match. Confirm the non-dedup path (`hideDuplicateASNs=false`) still works.

**Files:** [backend/models/query/report-query.js](../../../backend/models/query/report-query.js), [src/components/filters/FilterDateTime.tsx](../../../src/components/filters/FilterDateTime.tsx), [src/pages/Reports/components/ReportsFilters.tsx](../../../src/pages/Reports/components/ReportsFilters.tsx).

---

## Workstream B — Incident start-time filter

**Current state.** Start-time *sort* already exists end-to-end (`GROUP_SORTBY` has `descStartDate`/`ascStartDate` → `incidentStartedAt` in [groupController.js:44-54](../../../backend/api/controllers/groupController.js#L44-L54)) and the sort dropdown in `IncidentsFilters` renders above **both** the card and table views ([incidents/index.tsx:204](../../../src/pages/incidents/index.tsx#L204)) — so no sort work is needed. The `after`/`before` query params also already flow frontend→backend (`GroupQueryState` has them; `urlFromQuery` passes them). What's missing: (1) no date UI control in the incidents filter bar, and (2) the backend maps `before`/`after` to **`storedAt`** (ingest time), not incident start time.

**Changes.**
1. **Backend — retarget to incident start.** In [groupController.js:730-740 `parseQueryData`](../../../backend/api/controllers/groupController.js#L730-L740), map `before`/`after` to `incidentStartedAt` (cast to `Date`) instead of `storedAt`:
   ```js
   if (queryString.before) queryString.incidentStartedAt = { $lte: new Date(queryString.before) };
   if (queryString.after)  queryString.incidentStartedAt = Object.assign({}, queryString.incidentStartedAt, { $gte: new Date(queryString.after) });
   ```
   Add `'incidentStartedAt'` to `Group.filterAttributes` in [backend/shared/group.js:11-14](../../../backend/shared/group.js) so `_.pick` keeps it and `queryGroups` copies it into the Mongo filter (it iterates `filterAttributes`, [group.js:261-265](../../../backend/models/group.js#L261-L265)). `incidentStartedAt` is already indexed ([group.js:67](../../../backend/models/group.js#L67)). Leave the existing `since`→`storedAt.$gte` live-poll logic alone.
2. **Frontend — add the control.** Add a `FilterDateTime` to [IncidentsFilters.tsx](../../../src/pages/incidents/IncidentsFilters.tsx) (reuse the same component as alerts) wired to `before`/`after` params, labeled e.g. `"Incident start"`. No API-client change needed (`urlFromQuery` already forwards `before`/`after`).

**Verify.** Set a start-date range; confirm only incidents whose `incidentStartedAt` falls in range appear, in both card and table views, and that it composes with the existing sort dropdown and Open/Closed filter.

**Files:** [backend/api/controllers/groupController.js](../../../backend/api/controllers/groupController.js), [backend/shared/group.js](../../../backend/shared/group.js), [src/pages/incidents/IncidentsFilters.tsx](../../../src/pages/incidents/IncidentsFilters.tsx).

---

## Workstream C — Source badges on incident cards

**Goal (todo).** "On all card view → have tags that indicate the source of the reports associated with the incident." Today cards render `smtcTags` (manual tags), not report sources ([IncidentListItem.tsx:111](../../../src/pages/incidents/IncidentListItem.tsx#L111)). Each report carries its source in `_media[]` (e.g. `["ioda"]`, `["cloudflare"]`, `["twitter"]`, [report.js:43](../../../backend/models/report.js#L43)), and reports back-reference their incident via `_group` ([report.js:45](../../../backend/models/report.js#L45)). The group-list endpoint only populates `creator`/`assignedTo`, so `item._reports` is bare ObjectIds — the distinct media must be computed server-side.

**Changes.**
1. **Backend — enrich the group list.** Mirror the existing `addPopulationCoverageToGroups` enrichment pattern ([groupController.js:755](../../../backend/api/controllers/groupController.js#L755), already awaited in `group_groups` at [L74](../../../backend/api/controllers/groupController.js#L74)). Add `addReportSourcesToGroups(groups)` that runs one aggregation over the page's group ids:
   ```js
   Report.aggregate([
     { $match: { _group: { $in: groupObjectIds } } },
     { $unwind: '$_media' },
     { $group: { _id: '$_group', sources: { $addToSet: '$_media' } } },
   ])
   ```
   Map results back onto each group as `reportSources: string[]` (default `[]`). Call it alongside the coverage enrichment (compose in the same `async` handler). Consider adding it to `group_details` too for consistency, but the todo only requires the card view.
2. **Frontend — render badges.** Add `reportSources?: string[]` to the `Group` type ([src/api/groups/types.ts](../../../src/api/groups/types.ts)). In [IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx) render a small badge per source near the existing tags, reusing [SocialMediaIcon.tsx](../../../src/components/SocialMediaPost/SocialMediaIcon.tsx) (`mediaKey={source}`) for a consistent icon set.

**Verify.** Open an incident with mixed-source reports (e.g. IODA + Cloudflare); confirm distinct source badges appear on the card, and an incident with no reports shows none.

**Files:** [backend/api/controllers/groupController.js](../../../backend/api/controllers/groupController.js), [src/api/groups/types.ts](../../../src/api/groups/types.ts), [src/pages/incidents/IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx), [src/components/SocialMediaPost/SocialMediaIcon.tsx](../../../src/components/SocialMediaPost/SocialMediaIcon.tsx) (reuse).

---

## Workstream D — IODA recovery tracking

**API investigation (verified against live `https://api.ioda.inetintel.cc.gatech.edu/v2/`).** Aggie already fetches the **events** endpoint. Each event carries **`overlaps_window`** — the ongoing signal: `false` = the event's `[start, start+duration]` interval closed inside the queried window (recovered); `true` = it reaches/exceeds `until` and IODA is still observing it (ongoing). `duration` on an ongoing event grows across fetches until IODA closes it. The separate **alerts** endpoint (per-datapoint `level: critical|warning|normal`) confirms the semantics — a `normal` alert lands exactly at `start+duration` of the recovering event — but is **not needed**: everything required is already on the event objects we fetch. **Recommendation: derive recovery from `overlaps_window` alone; no second endpoint call** (the fetch loop already fans out 4 queryTypes × N entities with Playwright SVG scraping — doubling it for alerts is costly and redundant).

**1. Recovery signal (in `parseEvent`).** Compute alongside the existing `eventEndedAtSeconds` ([ioda.js:288-296](../../../backend/fetching/channels/ioda.js#L288-L296)):
```js
const eventEndSeconds = event.start + event.duration;
const RECOVERY_GRACE_SECONDS = 15 * 60; // > IODA's ~5-min datapoint cadence
const isOngoing = event.overlaps_window === true
  || eventEndSeconds >= (this.fetchToTimestamp - RECOVERY_GRACE_SECONDS); // time-based fallback if field missing
const outageStatus = isOngoing ? 'ongoing' : 'recovered';
const recoveredAt  = isOngoing ? null : new Date(eventEndSeconds * 1000);
```

**2. Schema — [report.js:19-21](../../../backend/models/report.js#L19-L21)** (Mongoose 5 syntax), keep `outageEndedAt`, add:
```js
outageStatus: { type: String, enum: ['ongoing', 'recovered'], default: 'ongoing', index: true },
recoveredAt:  { type: Date, default: null },
```
Add index (near [report.js:79-85](../../../backend/models/report.js#L84)): `schema.index({ isOutageEvent: 1, outageStatus: 1, authoredAt: -1 });`
Semantics (comment it): `outageEndedAt` = `start+duration`, always present, *advances each fetch while ongoing* ("last seen bad"); `recoveredAt` = non-null **only** once IODA confirms closure — keeps an ongoing report's moving end usable for charting without claiming it recovered.

**3. Parse + dedup-update — [ioda.js](../../../backend/fetching/channels/ioda.js).**
- In `parseEvent` set `post.outageStatus`/`post.recoveredAt` next to the existing outage assignments (~[L425-427](../../../backend/fetching/channels/ioda.js#L425)); optionally add `overlaps_window` to `raw` (~L397-408) for debugging.
- In the existing-report update block ([ioda.js:179-206](../../../backend/fetching/channels/ioda.js#L179-L206)): **latch** to recovered — once `outageStatus === 'recovered'`, never revert; set `recoveredAt` once on the transition. While `overlaps_window` stays true, leave status `'ongoing'` and let `outageEndedAt` advance. Trigger `recomputeIncidentDurationForGroups` on **status-flip too**, not just `endChanged`:
```js
const wasOngoing   = existingReport.outageStatus !== 'recovered';
const nowRecovered = formattedEvent.outageStatus === 'recovered';
const statusFlipped = wasOngoing && nowRecovered;
existingReport.outageEndedAt = formattedEvent.outageEndedAt;
if (nowRecovered) {
  existingReport.outageStatus = 'recovered';
  if (!existingReport.recoveredAt) existingReport.recoveredAt = formattedEvent.recoveredAt || formattedEvent.outageEndedAt;
}
// ...existing content/url/metadata updates + save...
if ((endChanged || statusFlipped) && existingReport._group) affectedGroupIds.add(existingReport._group.toString());
```
(The `guid = queryType-start-location-datasource` is unique per outage start, so a recovered guid reappearing is the same closed event; a genuinely new outage gets a new report.)

**4. Migration.** The `default: 'ongoing'` is wrong for historical closed events, so **backfill** rather than rely on it: one-off mongo update — for `isOutageEvent:true` docs with `outageEndedAt` in the past, set `outageStatus:'recovered'`, `recoveredAt = $outageEndedAt`. Since Aggie only fetches a ~2h trailing window, essentially all pre-existing reports are already closed. (Run manually as a migration script — out of scope for the code change itself.)

**5. Downstream.**
- `serializeReport` spreads the whole report ([reportController.js:82-92](../../../backend/api/controllers/reportController.js#L82-L92)) → `outageStatus`/`recoveredAt` are **auto-exposed**, no serializer change.
- Optional: add an `outageStatus` query filter in `reportController.parseQueryData`/`report-query.js` mirroring the existing `isOutageEvent` handling; and an "Ongoing/Recovered" badge in the alerts UI (`report.outageStatus`, showing `recoveredAt` when present, else `outageEndedAt` as "last seen"). Defer UI to the alerts design-polish pass.
- Optional follow-up: `incidentDuration.js` `computeIncidentTimeBoundsFromReports` uses `max(outageEndedAt)`; for an incident whose member reports are all `ongoing` that end is a moving value — consider marking the group ongoing (leave `incidentEndedAt` null) when any member is ongoing. Not required for core recovery tracking.

**Verify.** Pick a currently-ongoing IODA outage: first fetch stores `outageStatus:'ongoing'`, `recoveredAt:null`, `outageEndedAt` advancing on re-fetch; after IODA closes it, a later fetch flips to `'recovered'` with `recoveredAt` set and does not revert. Confirm `incidentDuration` recompute fires on the flip.

**Files:** [backend/models/report.js](../../../backend/models/report.js), [backend/fetching/channels/ioda.js](../../../backend/fetching/channels/ioda.js), [backend/api/utils/incidentDuration.js](../../../backend/api/utils/incidentDuration.js) (optional), [backend/api/controllers/reportController.js](../../../backend/api/controllers/reportController.js) (optional filter/serialize).

---

## Suggested sequencing

A and B are small, high-value, low-risk — ship first. C is a self-contained enrichment + badge. D (recovery tracking) is the largest (fetch-channel + schema + migration) and should land last with its own verification. Statuses remain deferred.
