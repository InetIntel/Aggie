# feat/incident-alert-filtering — Branch Plan & Shipped Work

> **Scope note.** This is the consolidated record for the `feat/incident-alert-filtering`
> branch. The four filtering **Workstreams (A–D)** below are the branch's core goal
> (A/B/C shipped, **D — IODA recovery tracking — is the one remaining piece**). The
> **["Other work shipped on this branch"](#other-work-shipped-on-this-branch-consolidated)**
> section near the end folds in the adjacent alerts/incidents plans that also shipped here
> (previously their own docs). Two plans that did **not** ship stay as standalone docs:
> [cloudflare-chart-caching.md](cloudflare-chart-caching.md) (design-only) and
> [fix-assign-user-in-operator-crash.md](fix-assign-user-in-operator-crash.md) (live bug).
> Open follow-ups for all of this work live in [todo.md](todo.md).

## Context

The **Incidents / alerts filtering** section of [todo.md](todo.md#L180-L194) collects usability gaps that surfaced after the elections→Aggie (internet-outage) pivot. This plan tackles them as four independent workstreams. Product decisions confirmed with the user:

- **Statuses/escalation** → **deferred** (out of scope here; the dormant `status` enum and the escalated/closed model are left untouched, to be redesigned in a separate discussion).
- **Alerts date filter** → keep filtering by **outage start time** (`authoredAt`) but **fix** it (it silently under/over-reports) and label it clearly.
- **IODA recovery** → **implement recovery tracking** (distinguish an ongoing outage from a recovered one, not just a computed end time). This applies at **both** levels: the individual report/alert **and** the incident that aggregates reports — an incident with any still-ongoing member must show "ongoing" instead of a (misleading) end time.
- **Incident start time** → **add a start-time filter**, keep the current default sort (start-time _sort_ already exists and is exposed in both views).

Each workstream below is self-contained and can ship independently.

---

## Implementation status (as of 2026-07-31)

| Workstream | Status | Notes |
|---|---|---|
| **A** — Alerts date filter fix | ✅ **Done** | Date casting + `label` prop + `console.log` removed all shipped |
| **B** — Incident start-time filter | ✅ **Done** | Backend retarget to `incidentStartedAt` + frontend `FilterDateTime` shipped |
| **C** — Source badges on incident cards | ✅ **Done** | `addReportSourcesToGroups` enrichment + card badges shipped |
| **D** — IODA recovery tracking | ⬜ **Not started** | Largest workstream; no code yet — the remaining work |

A, B, and C are merged on branch `feat/incident-alert-filtering`; the design text for those is retained below as a record of what was built. **Only Workstream D remains.**

---

## Workstream A — Alerts date filter fix (outage start time) — ✅ DONE

> **Status: implemented.** Bounds are cast to `Date` with an `isNaN` guard at
> [report-query.js:73-80](../../../backend/models/query/report-query.js#L73-L80); `FilterDateTime`
> gained an optional `label` prop (default "Date Range") and the stray `console.log` was removed
> ([FilterDateTime.tsx:13,20](../../../src/components/filters/FilterDateTime.tsx#L13)); the alerts
> control passes `label='Outage start'` ([ReportsFilters.tsx:244](../../../src/pages/Reports/components/ReportsFilters.tsx#L244)).

**Problem.** The alerts table date filter sets `before`/`after` params ([ReportsFilters.tsx:243-248](../../../src/pages/Reports/components/ReportsFilters.tsx#L243-L248) → `FilterDateTime`, value is an ISO string from `date.toISOString()`). The backend applies them to `authoredAt` in [report-query.js:70-71](../../../backend/models/query/report-query.js#L70-L71):

```js
if (this.before) filter.authoredAt = { $lte: this.before }; // this.before is a STRING
if (this.after)
  filter.authoredAt = Object.assign({}, filter.authoredAt, {
    $gte: this.after,
  });
```

The alerts list is served by the **deduped** path (`queryReportsDeduped`, [report.js:278-388](../../../backend/models/report.js#L278-L388)), which runs both a `Report.find(filter)` (Mongoose **casts** the ISO string → `Date`, so the visible list _is_ filtered) **and** a `Report.aggregate([{ $match: filter }, …])` for the `total` count. **Mongoose aggregation does NOT cast `$match`**, so the count compares the `Date` field against a raw string and ignores the date bound — `total` is wrong, so pagination shows phantom/empty pages and the filter reads as "not working."

**Fix.**

1. Cast the bounds to `Date` where the filter is built so both `find` and `aggregate` agree — [report-query.js:70-71](../../../backend/models/query/report-query.js#L70-L71):
   ```js
   if (this.before) filter.authoredAt = { $lte: new Date(this.before) };
   if (this.after)
     filter.authoredAt = Object.assign({}, filter.authoredAt, {
       $gte: new Date(this.after),
     });
   ```
   (Guard against invalid dates — skip the clause if `isNaN(d.getTime())`.)
2. Clarify the control. `FilterDateTime` hard-codes the label `"Date Range"` ([FilterDateTime.tsx:39](../../../src/components/filters/FilterDateTime.tsx#L39)). Add an optional `label`/`title` prop and pass e.g. `"Outage start"` from the alerts `ReportsFilters` so users know it filters on outage start time, not ingest time. Also remove the stray `console.log(beforeDate)` at [FilterDateTime.tsx:20](../../../src/components/filters/FilterDateTime.tsx#L20).

**Verify.** With a known outage set, run `db.reports.find({isOutageEvent:true, authoredAt:{$gte: ISODate(...)}}).count()` and compare to the alerts table `total` after applying the same after-date; they should match. Confirm the non-dedup path (`hideDuplicateASNs=false`) still works.

**Files:** [backend/models/query/report-query.js](../../../backend/models/query/report-query.js), [src/components/filters/FilterDateTime.tsx](../../../src/components/filters/FilterDateTime.tsx), [src/pages/Reports/components/ReportsFilters.tsx](../../../src/pages/Reports/components/ReportsFilters.tsx).

---

## Workstream B — Incident start-time filter — ✅ DONE

> **Status: implemented.** `before`/`after` are retargeted to `incidentStartedAt` (cast to `Date`) in
> `parseQueryData` ([groupController.js:733-738](../../../backend/api/controllers/groupController.js#L733-L738)),
> `incidentStartedAt` is in `filterAttributes` ([group.js:13](../../../backend/shared/group.js#L13)),
> and the incidents filter bar renders a `FilterDateTime` labeled "Incident start"
> ([IncidentsFilters.tsx:154-159](../../../src/pages/incidents/IncidentsFilters.tsx#L154-L159)).

**Current state.** Start-time _sort_ already exists end-to-end (`GROUP_SORTBY` has `descStartDate`/`ascStartDate` → `incidentStartedAt` in [groupController.js:44-54](../../../backend/api/controllers/groupController.js#L44-L54)) and the sort dropdown in `IncidentsFilters` renders above **both** the card and table views ([incidents/index.tsx:204](../../../src/pages/incidents/index.tsx#L204)) — so no sort work is needed. The `after`/`before` query params also already flow frontend→backend (`GroupQueryState` has them; `urlFromQuery` passes them). What's missing: (1) no date UI control in the incidents filter bar, and (2) the backend maps `before`/`after` to **`storedAt`** (ingest time), not incident start time.

**Changes.**

1. **Backend — retarget to incident start.** In [groupController.js:730-740 `parseQueryData`](../../../backend/api/controllers/groupController.js#L730-L740), map `before`/`after` to `incidentStartedAt` (cast to `Date`) instead of `storedAt`:
   ```js
   if (queryString.before)
     queryString.incidentStartedAt = { $lte: new Date(queryString.before) };
   if (queryString.after)
     queryString.incidentStartedAt = Object.assign(
       {},
       queryString.incidentStartedAt,
       { $gte: new Date(queryString.after) },
     );
   ```
   Add `'incidentStartedAt'` to `Group.filterAttributes` in [backend/shared/group.js:11-14](../../../backend/shared/group.js) so `_.pick` keeps it and `queryGroups` copies it into the Mongo filter (it iterates `filterAttributes`, [group.js:261-265](../../../backend/models/group.js#L261-L265)). `incidentStartedAt` is already indexed ([group.js:67](../../../backend/models/group.js#L67)). Leave the existing `since`→`storedAt.$gte` live-poll logic alone.
2. **Frontend — add the control.** Add a `FilterDateTime` to [IncidentsFilters.tsx](../../../src/pages/incidents/IncidentsFilters.tsx) (reuse the same component as alerts) wired to `before`/`after` params, labeled e.g. `"Incident start"`. No API-client change needed (`urlFromQuery` already forwards `before`/`after`).

**Verify.** Set a start-date range; confirm only incidents whose `incidentStartedAt` falls in range appear, in both card and table views, and that it composes with the existing sort dropdown and Open/Closed filter.

**Files:** [backend/api/controllers/groupController.js](../../../backend/api/controllers/groupController.js), [backend/shared/group.js](../../../backend/shared/group.js), [src/pages/incidents/IncidentsFilters.tsx](../../../src/pages/incidents/IncidentsFilters.tsx).

---

## Workstream C — Source badges on incident cards — ✅ DONE

> **Status: implemented.** `addReportSourcesToGroups` runs one aggregation over the page's group ids
> and maps `reportSources: string[]` onto each group
> ([groupController.js:831](../../../backend/api/controllers/groupController.js#L831), awaited at
> [L75](../../../backend/api/controllers/groupController.js#L75)); `reportSources?: string[]` is on the
> `Group` type ([types.ts:47](../../../src/api/groups/types.ts#L47)); the card renders a
> `SocialMediaIcon` per source ([IncidentListItem.tsx:115-121](../../../src/pages/incidents/IncidentListItem.tsx#L115-L121)).

**Goal (todo).** "On all card view → have tags that indicate the source of the reports associated with the incident." Today cards render `smtcTags` (manual tags), not report sources ([IncidentListItem.tsx:111](../../../src/pages/incidents/IncidentListItem.tsx#L111)). Each report carries its source in `_media[]` (e.g. `["ioda"]`, `["cloudflare"]`, `["twitter"]`, [report.js:43](../../../backend/models/report.js#L43)), and reports back-reference their incident via `_group` ([report.js:45](../../../backend/models/report.js#L45)). The group-list endpoint only populates `creator`/`assignedTo`, so `item._reports` is bare ObjectIds — the distinct media must be computed server-side.

**Changes.**

1. **Backend — enrich the group list.** Mirror the existing `addPopulationCoverageToGroups` enrichment pattern ([groupController.js:755](../../../backend/api/controllers/groupController.js#L755), already awaited in `group_groups` at [L74](../../../backend/api/controllers/groupController.js#L74)). Add `addReportSourcesToGroups(groups)` that runs one aggregation over the page's group ids:
   ```js
   Report.aggregate([
     { $match: { _group: { $in: groupObjectIds } } },
     { $unwind: "$_media" },
     { $group: { _id: "$_group", sources: { $addToSet: "$_media" } } },
   ]);
   ```
   Map results back onto each group as `reportSources: string[]` (default `[]`). Call it alongside the coverage enrichment (compose in the same `async` handler). Consider adding it to `group_details` too for consistency, but the todo only requires the card view.
2. **Frontend — render badges.** Add `reportSources?: string[]` to the `Group` type ([src/api/groups/types.ts](../../../src/api/groups/types.ts)). In [IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx) render a small badge per source near the existing tags, reusing [SocialMediaIcon.tsx](../../../src/components/SocialMediaPost/SocialMediaIcon.tsx) (`mediaKey={source}`) for a consistent icon set.

**Verify.** Open an incident with mixed-source reports (e.g. IODA + Cloudflare); confirm distinct source badges appear on the card, and an incident with no reports shows none.

**Files:** [backend/api/controllers/groupController.js](../../../backend/api/controllers/groupController.js), [src/api/groups/types.ts](../../../src/api/groups/types.ts), [src/pages/incidents/IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx), [src/components/SocialMediaPost/SocialMediaIcon.tsx](../../../src/components/SocialMediaPost/SocialMediaIcon.tsx) (reuse).

---

## Workstream D — IODA recovery tracking — ⬜ NOT STARTED

> **Status: not started.** None of the below is in the code yet — no `outageStatus`/`recoveredAt` on
> the report schema, no `overlaps_window` handling in `ioda.js`, no `anyOngoing`/`incidentOngoing`
> logic in `incidentDuration.js`, no `incidentOngoing` group field, and no "Ongoing" pill in the
> card/table views. This is the remaining workstream.

**API investigation (verified against live `https://api.ioda.inetintel.cc.gatech.edu/v2/`).** Aggie already fetches the **events** endpoint. Each event carries **`overlaps_window`** — the ongoing signal: `false` = the event's `[start, start+duration]` interval closed inside the queried window (recovered); `true` = it reaches/exceeds `until` and IODA is still observing it (ongoing). `duration` on an ongoing event grows across fetches until IODA closes it. The separate **alerts** endpoint (per-datapoint `level: critical|warning|normal`) confirms the semantics — a `normal` alert lands exactly at `start+duration` of the recovering event — but is **not needed**: everything required is already on the event objects we fetch. **Recommendation: derive recovery from `overlaps_window` alone; no second endpoint call** (the fetch loop already fans out 4 queryTypes × N entities with Playwright SVG scraping — doubling it for alerts is costly and redundant).

**1. Recovery signal (in `parseEvent`).** Compute alongside the existing `eventEndedAtSeconds` ([ioda.js:288-296](../../../backend/fetching/channels/ioda.js#L288-L296)):

```js
const eventEndSeconds = event.start + event.duration;
const RECOVERY_GRACE_SECONDS = 15 * 60; // > IODA's ~5-min datapoint cadence
const isOngoing =
  event.overlaps_window === true ||
  eventEndSeconds >= this.fetchToTimestamp - RECOVERY_GRACE_SECONDS; // time-based fallback if field missing
const outageStatus = isOngoing ? "ongoing" : "recovered";
const recoveredAt = isOngoing ? null : new Date(eventEndSeconds * 1000);
```

**2. Schema — [report.js:19-21](../../../backend/models/report.js#L19-L21)** (Mongoose 5 syntax), keep `outageEndedAt`, add:

```js
outageStatus: { type: String, enum: ['ongoing', 'recovered'], default: 'ongoing', index: true },
recoveredAt:  { type: Date, default: null },
```

Add index (near [report.js:79-85](../../../backend/models/report.js#L84)): `schema.index({ isOutageEvent: 1, outageStatus: 1, authoredAt: -1 });`
Semantics (comment it): `outageEndedAt` = `start+duration`, always present, _advances each fetch while ongoing_ ("last seen bad"); `recoveredAt` = non-null **only** once IODA confirms closure — keeps an ongoing report's moving end usable for charting without claiming it recovered.

**3. Parse + dedup-update — [ioda.js](../../../backend/fetching/channels/ioda.js).**

- In `parseEvent` set `post.outageStatus`/`post.recoveredAt` next to the existing outage assignments (~[L425-427](../../../backend/fetching/channels/ioda.js#L425)); optionally add `overlaps_window` to `raw` (~L397-408) for debugging.
- In the existing-report update block ([ioda.js:179-206](../../../backend/fetching/channels/ioda.js#L179-L206)): **latch** to recovered — once `outageStatus === 'recovered'`, never revert; set `recoveredAt` once on the transition. While `overlaps_window` stays true, leave status `'ongoing'` and let `outageEndedAt` advance. Trigger `recomputeIncidentDurationForGroups` on **status-flip too**, not just `endChanged`:

```js
const wasOngoing = existingReport.outageStatus !== "recovered";
const nowRecovered = formattedEvent.outageStatus === "recovered";
const statusFlipped = wasOngoing && nowRecovered;
existingReport.outageEndedAt = formattedEvent.outageEndedAt;
if (nowRecovered) {
  existingReport.outageStatus = "recovered";
  if (!existingReport.recoveredAt)
    existingReport.recoveredAt =
      formattedEvent.recoveredAt || formattedEvent.outageEndedAt;
}
// ...existing content/url/metadata updates + save...
if ((endChanged || statusFlipped) && existingReport._group)
  affectedGroupIds.add(existingReport._group.toString());
```

(The `guid = queryType-start-location-datasource` is unique per outage start, so a recovered guid reappearing is the same closed event; a genuinely new outage gets a new report.)

**4. Migration.** The `default: 'ongoing'` is wrong for historical closed events, so **backfill** rather than rely on it: one-off mongo update — for `isOutageEvent:true` docs with `outageEndedAt` in the past, set `outageStatus:'recovered'`, `recoveredAt = $outageEndedAt`. Since Aggie only fetches a ~2h trailing window, essentially all pre-existing reports are already closed. For incidents, the new `incidentOngoing` default of `false` is already correct for historical incidents (all closed); no group backfill is needed unless you want to be exact, in which case run `recomputeIncidentDurationForGroups` over existing group ids after the report backfill. (Run manually as a migration script — out of scope for the code change itself.)

**5. Downstream.**

- `serializeReport` spreads the whole report ([reportController.js:82-92](../../../backend/api/controllers/reportController.js#L82-L92)) → `outageStatus`/`recoveredAt` are **auto-exposed**, no serializer change.
- Optional: add an `outageStatus` query filter in `reportController.parseQueryData`/`report-query.js` mirroring the existing `isOutageEvent` handling; and an "Ongoing/Recovered" badge in the alerts UI (`report.outageStatus`, showing `recoveredAt` when present, else `outageEndedAt` as "last seen"). Defer the alerts-table UI badge to the alerts design-polish pass.

**6. Propagate ongoing status up to the incident (required).** An incident aggregates member reports, so its displayed end time must reflect them: if **any** member report is still `ongoing`, the incident is ongoing and must **not** show an end time.

- **Backend — group schema** ([group.js:67-69](../../../backend/models/group.js#L67-L69)): add `incidentOngoing: { type: Boolean, default: false, index: true }` next to the existing `incidentStartedAt`/`incidentEndedAt`/`incidentDurationSeconds`.
- **Backend — recompute** ([incidentDuration.js](../../../backend/api/utils/incidentDuration.js)): extend the report `.select(...)` at [L65](../../../backend/api/utils/incidentDuration.js#L65) to include `outageStatus`, and in `computeIncidentTimeBoundsFromReports` ([L12-44](../../../backend/api/utils/incidentDuration.js#L12-L44)) also derive `anyOngoing = reports.some(r => r.isOutageEvent && r.outageStatus === 'ongoing')`. In `recomputeIncidentDurationForGroup` ([L69-76](../../../backend/api/utils/incidentDuration.js#L69-L76)) set `group.incidentOngoing = anyOngoing`; when ongoing, force `incidentEndedAt = null` and `incidentDurationSeconds = null` (an open interval has no closed end/duration). Keep `incidentStartedAt = minStart`. This recompute already fires whenever a member report's status flips (see step 3 — `statusFlipped` is added to the trigger), so incidents transition ongoing→closed automatically.
- **Frontend — display** ([src/api/groups/types.ts](../../../src/api/groups/types.ts): add `incidentOngoing?: boolean`). In the card view ([IncidentListItem.tsx:114-118](../../../src/pages/incidents/IncidentListItem.tsx#L114-L118)) and the table Date column ([IncidentsTable.tsx:109-116](../../../src/pages/incidents/TableView/IncidentsTable.tsx#L109-L116)), when `incidentOngoing` is true render an **"Ongoing"** pill/label in place of the end timestamp (keep showing the start). Reuse existing badge styling.

**Verify.**

- _Report level:_ pick a currently-ongoing IODA outage — first fetch stores `outageStatus:'ongoing'`, `recoveredAt:null`, `outageEndedAt` advancing on re-fetch; after IODA closes it, a later fetch flips to `'recovered'` with `recoveredAt` set and does not revert.
- _Incident level:_ add that ongoing report to an incident → incident shows "Ongoing" (no end time) in both card and table views, `incidentEndedAt`/`incidentDurationSeconds` are null; once the report recovers, the next `recomputeIncidentDurationForGroups` sets `incidentOngoing:false` and the real end time/duration appear.

**Files:** [backend/models/report.js](../../../backend/models/report.js), [backend/fetching/channels/ioda.js](../../../backend/fetching/channels/ioda.js), [backend/api/utils/incidentDuration.js](../../../backend/api/utils/incidentDuration.js), [backend/models/group.js](../../../backend/models/group.js), [src/api/groups/types.ts](../../../src/api/groups/types.ts), [src/pages/incidents/IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx), [src/pages/incidents/TableView/IncidentsTable.tsx](../../../src/pages/incidents/TableView/IncidentsTable.tsx), [backend/api/controllers/reportController.js](../../../backend/api/controllers/reportController.js) (optional filter/serialize).

---

## Suggested sequencing

A and B are small, high-value, low-risk — ship first. C is a self-contained enrichment + badge. D (recovery tracking) is the largest (fetch-channel + schema + migration) and should land last with its own verification. Statuses remain deferred.

**Update (2026-07-31):** A, B, and C are all shipped as planned. Only **D (IODA recovery tracking)** remains — the next piece of work, to be landed with its own verification per the Workstream D section above.

---

## Other work shipped on this branch (consolidated)

These plans previously lived as separate docs in `docs/claude/plans/`; each shipped on
`feat/incident-alert-filtering` and is folded here as a compact record. Full original
design text is recoverable from git history. Residual/backlog items are pointed at
[todo.md](todo.md).

### Incident lifecycle-stage filter — ✅ shipped (`be27bc30`)

Replaced the incidents list's **Open / Closed / All** radio (a stale elections carryover)
with a **multi-select lifecycle-stage filter** (Verification / Confirmation / Published,
OR semantics) plus a separate **"Include closed"** toggle. Default view = all non-closed
incidents. Stages derive from the existing `verification_status` / `confirmation_status` /
`publication_status` fields (strict-pipeline precedence: publication > confirmation >
verification) — no schema change. This is filtering work and belongs alongside Workstreams
A–D above.

- **Backend:** `stages` added to `Group.filterAttributes` ([backend/shared/group.js](../../../backend/shared/group.js)); `stages` → real predicates translated in `Group.queryGroups` ([backend/models/group.js](../../../backend/models/group.js)), pushed as an `$and`/`$or` clause; existing `closed` handling reused (`closed=all` surfaces closed).
- **Frontend:** `stages?: string` on `GroupQueryState` ([src/api/groups/types.ts](../../../src/api/groups/types.ts)); stage toggle set + "Include closed" checkbox in [src/pages/incidents/IncidentsFilters.tsx](../../../src/pages/incidents/IncidentsFilters.tsx); title-search clears the stage filter. Status **display** badges (`IncidentStatuses.tsx`) unchanged.

### Alerts "ASN / Network" column — ✅ shipped (`0a441f53`)

Repurposed the alerts table's redundant **Source** column (which just re-printed
"IODA"/"Cloudflare", duplicating the Platform icon) into a stacked **ASN / Network** cell —
ASN emphasized on top, network name truncated below. All data was already on the row
(`report.asn`, `metadata.rawAPIResponse.entityName`/`entityScope`), so **no backend change**;
works on historical alerts. Network name = `entityName` with the trailing ` - <scope>`
stripped; non-ASN (country/region) outages degrade to a single line.

- **Frontend:** `reportNetwork()` resolver + `NetworkCell` and updated column def in [src/pages/Reports/TableView/reportColumns.tsx](../../../src/pages/Reports/TableView/reportColumns.tsx); `asn?: string` added to the `Report` type ([src/api/reports/types.ts](../../../src/api/reports/types.ts)).

### Compare in list view (alerts + incidents) — ✅ shipped (`359adc8f`, `44552732`)

The side-by-side **Compare** feature (previously table-view only) now also works in the
**list view** of both pages. The compare state/modal were already view-agnostic; the change
only unlocked the **trigger surface**: show the Compare button in list view and make list
rows feed the compare selection (cap enforcement + chart prefetch for alerts).

- **Frontend:** ungate the Compare button + shared `toggleReportForCompare` / `toggleIncidentForCompare` helpers in [src/pages/Reports/AllReportsList.tsx](../../../src/pages/Reports/AllReportsList.tsx) and [src/pages/incidents/index.tsx](../../../src/pages/incidents/index.tsx); added selection support (via `MultiSelectListItem`) to [src/pages/incidents/IncidentListItem.tsx](../../../src/pages/incidents/IncidentListItem.tsx). Reused `useMultiSelect`, `CompareActionBar`, the compare modals, and `MAX_COMPARE`. Selection resets on list↔table switch (kept intentionally). *Backlog: compare-modal polish for >3 items — see [todo.md](todo.md).*

### User-configurable date/time display preferences — ✅ shipped (`ee93c3ef`)

Added per-user **Clock (12h/24h)**, **Date order (MDY/DMY)**, and **Timezone (local/UTC)**
preferences (defaults: 24h + DMY + local) and centralized scattered date/time formatting
into one preference-driven formatter so every display site honors the choice.

- **Backend:** `preferences` sub-doc on the user schema ([backend/models/user.js](../../../backend/models/user.js)); whitelisted self-update in `user_update` ([userController.js](../../../backend/api/controllers/userController.js)); exposed in the session payload ([authController.js](../../../backend/api/controllers/authController.js)).
- **Frontend:** pure builders in `src/utils/dateFormat.ts` + `useFormatters()` hook (reads the `["session"]` query); display sites migrated to the hook; a **"Display preferences"** section in [src/pages/Settings/user/UserProfile.tsx](../../../src/pages/Settings/user/UserProfile.tsx). Preference types on `Session`/`User`.

### Alerts reload / re-render fix — ✅ partial (`769cb6d3`, `06819849`)

Root cause of the reported "the Alerts page hard-refreshes and wipes my progress" was **not**
a re-render or a 401 — it was the **CRA dev-server live-reloading** whenever the FETCH process
wrote fetched media into `public/media`. **Fix shipped:** `MEDIA_ROOT` now defaults to
`media-store/` in dev (only `public/media` in production), one change in
[backend/fetching/utils/socialImageStorage.js](../../../backend/fetching/utils/socialImageStorage.js);
`/media` is still served by the backend, no env var required. A `ResizeObserver`
crash-on-view-switch fix and compare-selection persistence also shipped (`06819849`).

The deeper **re-render perf work (steps 1–6:** `keepPreviousData`/`refetchOnWindowFocus:false`,
prop memoization, `React.memo` on rows, scroll-save/restore, view-toggle remount, socket
re-bind churn**) was implemented and then reverted** once the media-reload root cause was
found — it was never the cause of the reload. The confirmed standing re-render drivers
(from the merged findings doc) are: `react-time-ago` per-row tickers on Alerts, socket-listener
re-bind churn (`useSocketSubscribe` `[eventHandler]` dep), `isFetching`/focus/interval pulses,
and whole-list cache replacement re-rendering unmemoized rows. **These remain a separate perf
backlog — see [todo.md](todo.md).**

---

## Fixes that need to be made
