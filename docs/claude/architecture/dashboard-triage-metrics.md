# Dashboard triage metrics (Alerts & Social Media)

The dashboard's **Metrics card** (left tile in
[src/pages/Dashboard/index.tsx](../../../src/pages/Dashboard/index.tsx)) shows a
**triage-metrics list**: two sections — **Alerts** and **Social Media** — with six rows
each. Every row is `label · count`, where the count is a react-router `<Link>` to the
matching filtered report list (`/alerts` or `/mediaposts`). Counts honor the dashboard's
Today / Last 24h / Last 7d range selector.

This replaced an earlier set of three circular tiles (*Notable activities*, *High
confidence*, *Total reports*) read from the analytics-overview snapshot — those described
event clustering, not how a monitor actually works the triage queue.

**"Investigate"** here means the report's own triage flag (`irrelevant`; the UI maps
`false → Investigate`, `true → Ignore`), **not** an incident tag. The two Investigate
rows are that flag split by incident linkage.

## The 12 metrics (6 per category)

Sections: **Alerts** (`/alerts`, `isOutageEvent:true`) and **Social Media**
(`/mediaposts`, `isOutageEvent:false`). Every row carries range bounds, cast to real
`Date`: alert rows use `outageAfter=<rangeStartUtc>&outageBefore=<rangeEndUtc>`
(→ `outageStartedAt.$gte/$lt`), social rows use `after=<rangeStartUtc>&before=<rangeEndUtc>`
(→ `authoredAt.$gte/$lte`).

| Row | Deep-link params | Backend filter (via `ReportQuery`) |
|-----|------------------|-------------------------------------|
| Read | `status=Read`, `irrelevant=all` | `read:true` |
| Unread | `status=Unread`, `irrelevant=all` | `read:false` |
| Linked to incident | `groupId=any`, `irrelevant=all` | `_group:{$ne:null}` |
| Unlinked to incident | `groupId=none`, `irrelevant=all` | `_group:{$eq:null}` |
| Investigate — linked | `groupId=any`, `irrelevant=false` | linked + `irrelevant:"false"` |
| Investigate — unlinked | `groupId=none`, `irrelevant=false` | unlinked + `irrelevant:"false"` |

`_group` is an ObjectId path, so `''` can't be cast; the null-only predicates also match a
missing field ([report-query.js `_parseGroupId`](../../../backend/models/query/report-query.js)).

Non-Investigate rows use `irrelevant=all` to match the list (which forces `irrelevant=all`
when absent). Investigate rows use `irrelevant=false`, an exact match on the Investigate
state (untriaged `"maybe"` reports are excluded).

### `groupId=any|none` and incident access

The list route runs `requireIncidentQueryAccess`
([incidentAccessMiddlewares.js](../../../backend/api/middlewares/incidentAccessMiddlewares.js))
before `report_reports`. It access-checks a real incident id and rejects any other
non-ObjectId with 400, so it must let the `any` / `none` sentinels through; before it did,
every linked/unlinked deep link 400'd and the list rendered empty after TanStack Query's
retries.

Known gap: neither the counts nor the list apply the incident access filter. For a
non-admin, reports in another team's restricted incident count as "linked" and appear in
the linked list with `_group` stripped by `hideRestrictedIncidentReferences`, so they look
unlinked. Resolving this depends on whether reports can belong to multiple incidents
(pending design).

## Dedup applies to ALL alert rows

`urlFromReportsQuery` forces `entityLevel=<all ENTITY_LEVEL_OPTIONS>` +
`hideDuplicateASNs=true` on **every** alert query. In `report_reports`, an explicit
`hideDuplicateASNs==='true'` **overrides** `shouldDedupByEventIdentifier` and turns dedup
**on even when a `groupId` is present** — so all six alert rows are deduped in the list.
`entityLevel` is not just a dedup hint: it also adds a real filter
(`metadata.rawAPIResponse.entityLevel` must exist and match,
[report-query.js:163-175](../../../backend/models/query/report-query.js#L163-L175)), so
the count must carry it too.

Therefore **every metric count runs through the same dedup-aware path the list uses.**
The non-deduped total is `Report.countDocuments(filter)`; the deduped total is the
aggregation extracted into `Report.countReportsDedupedTotal`
([report.js:291](../../../backend/models/report.js#L291)) — a single source of truth
reused by `queryReportsDeduped`.

## Implementation map

### Backend
- [backend/models/report.js](../../../backend/models/report.js) — `Report.countReportsDedupedTotal(filter)`
  holds the dedup-total aggregation; `queryReportsDeduped` calls it.
- [backend/api/utils/reportCounts.js](../../../backend/api/utils/reportCounts.js) —
  `shouldDedupByEventIdentifier`, `resolveUseDedup(queryData, {hideDuplicateASNs})`
  (mirrors `report_reports`' dispatch), and `countReports(queryData, {hideDuplicateASNs})`
  (builds `ReportQuery` → filter, applies escalated/veracity overrides, dispatches to the
  deduped/plain count).
- [backend/api/controllers/reportController.js](../../../backend/api/controllers/reportController.js)
  — `report_reports` uses the shared `resolveUseDedup` (no local copy → no drift).
- [backend/api/controllers/analyticsController.js](../../../backend/api/controllers/analyticsController.js)
  — `analytics_report_metrics` + `METRIC_ROWS` / `METRIC_CATEGORIES` / `ENTITY_LEVEL_OPTIONS`
  spec. Resolves the range via `resolveAnalyticsTimeWindow(parseAnalyticsQuery(req.query))`;
  for alerts adds `entityLevel=<all>` + `hideDuplicateASNs='true'`; runs the 12 counts in
  `Promise.all`; returns counts plus per-row deep-link `query`.
- [backend/api/routes/analyticsRoutes.js](../../../backend/api/routes/analyticsRoutes.js)
  — `GET /report-metrics` (`User.can('view data')`).

### Frontend
- [src/api/analytics/types.ts](../../../src/api/analytics/types.ts) — `ReportMetric`,
  `ReportMetricCategory`, `ReportMetricsResponse`.
- [src/api/analytics/index.ts](../../../src/api/analytics/index.ts) — `getReportMetrics({ range })`.
- [src/pages/Dashboard/components/MetricsList.tsx](../../../src/pages/Dashboard/components/MetricsList.tsx)
  — two labeled sections, six `<Link>` rows each (`target=_blank`), href = base path +
  serialized `query`; loading/empty states.
- [src/pages/Dashboard/index.tsx](../../../src/pages/Dashboard/index.tsx) —
  `reportMetricsQuery = useQuery(["analytics","report-metrics",range], …, {keepPreviousData:true})`;
  `handleAnalyticsUpdate` also invalidates `["analytics","report-metrics",range]`.

## Parity invariant

The reason the counts and the list share `countReportsDedupedTotal` / `resolveUseDedup`
is **parity**: clicking a row must land on a list whose "Showing X of **N**" equals the
row's count. Any future change to how the alerts list dedups or filters must flow through
the shared helpers so the dashboard counts can't drift from the list.
