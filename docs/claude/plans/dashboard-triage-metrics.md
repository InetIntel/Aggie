# Dashboard triage metrics (Alerts & Social Media) — IMPLEMENTED

> Status: implemented on `feat/analytical-dashboard-frontend`. This doc reflects the built design; it corrects several paths/assumptions from the original draft (see **Corrections** below).

## Context

The dashboard's **Metrics card** (left tile in `src/pages/Dashboard/index.tsx`) previously showed three circular tiles — *Notable activities*, *High confidence*, *Total reports* — read from the analytics-overview snapshot (`GET /api/analytics/overview`). Those describe event clustering, not how a monitor works the triage queue.

They are **replaced** by a **triage-metrics list**: two sections (Alerts, Social Media), six rows each. Each row is `label · count`; the count is a react-router `<Link>` to the matching filtered report list (`/alerts` or `/mediaposts`). Counts honor the existing Today / Last 24h / Last 7d range selector.

**"Investigate"** = the report's own triage flag (`irrelevant`; UI `false → Investigate`, `true → Ignore`), not an incident tag. The two Investigate rows are that flag (active/`Investigate`) split by incident linkage.

## The 12 metrics (6 per category)

Sections: **Alerts** (`/alerts`, `isOutageEvent:true`) and **Social Media** (`/mediaposts`, `isOutageEvent:false`). All rows carry range bounds `after=<rangeStartUtc>&before=<rangeEndUtc>` (→ `authoredAt.$gte/$lte`, cast to real `Date`).

| Row | Deep-link params | Backend filter (via `ReportQuery`) |
|-----|------------------|-------------------------------------|
| Read | `status=Read`, `irrelevant=all` | `read:true` |
| Unread | `status=Unread`, `irrelevant=all` | `read:false` |
| Linked to incident | `groupId=any`, `irrelevant=all` | `_group:{$nin:[null,'']}` |
| Unlinked to incident | `groupId=none`, `irrelevant=all` | `_group:{$in:[null,'']}` |
| Investigate — linked | `groupId=any`, `irrelevant=false` | linked + `irrelevant:{$ne:"true"}` |
| Investigate — unlinked | `groupId=none`, `irrelevant=false` | unlinked + `irrelevant:{$ne:"true"}` |

Non-Investigate rows use `irrelevant=all` to match the list (which forces `irrelevant=all` when absent). Investigate rows use `irrelevant=false`, which falls through to the default `{$ne:"true"}` (there is no explicit `false` branch in `report-query.js`).

## Key correctness point: dedup applies to ALL alert rows

`urlFromReportsQuery` forces `entityLevel=<all ENTITY_LEVEL_OPTIONS>` + `hideDuplicateASNs=true` on **every** alert query. In `report_reports`, explicit `hideDuplicateASNs==='true'` **overrides** `shouldDedupByEventIdentifier` and turns dedup **on even when a `groupId` is present**. So all six alert rows are deduped in the list. Also, `entityLevel` is not just a dedup hint — it adds a real filter (`metadata.rawAPIResponse.entityLevel` must exist and match, `report-query.js:163-175`), so the count must carry it too.

**Therefore every metric count runs through the same dedup-aware path the list uses.** Non-deduped total = `Report.countDocuments(filter)`; deduped total = the aggregation extracted into `Report.countReportsDedupedTotal` (single source of truth, reused by `queryReportsDeduped`).

## What was built

### Backend
- `backend/models/report.js` — extracted the dedup-total aggregation into `Report.countReportsDedupedTotal(filter)`; `queryReportsDeduped` now calls it (no behavior change).
- `backend/api/utils/reportCounts.js` (new) — `shouldDedupByEventIdentifier`, `resolveUseDedup(queryData, {hideDuplicateASNs})` (mirrors `report_reports`' dispatch), and `countReports(queryData, {hideDuplicateASNs}) → Promise<number>` (builds `ReportQuery` → filter, applies escalated/veracity overrides, dispatches to deduped/plain count).
- `backend/api/controllers/reportController.js` — removed the local `shouldDedupByEventIdentifier`; `report_reports` now uses `resolveUseDedup` (shared, prevents drift).
- `backend/api/controllers/analyticsController.js` — new `analytics_report_metrics` handler + `METRIC_ROWS` / `METRIC_CATEGORIES` / `ENTITY_LEVEL_OPTIONS` spec source of truth. Resolves range via `resolveAnalyticsTimeWindow(parseAnalyticsQuery(req.query))`; for alerts adds `entityLevel=<all>` + `hideDuplicateASNs='true'`; runs 12 counts in `Promise.all`; returns counts + per-row deep-link `query`.
- `backend/api/routes/analyticsRoutes.js` — `GET /report-metrics` (`User.can('view data')`).

### Frontend
- `src/api/analytics/types.ts` — `ReportMetric`, `ReportMetricCategory`, `ReportMetricsResponse`.
- `src/api/analytics/index.ts` — `getReportMetrics({ range })`.
- `src/pages/Dashboard/components/MetricsList.tsx` (new) — two labeled sections, six `<Link>` rows each (`target=_blank`), href = base path + serialized `query`. Tokens: `#166534`, `divide-slate-200 dark:divide-gray-700`, dark variants. Loading/empty states.
- `src/pages/Dashboard/index.tsx` — `reportMetricsQuery = useQuery(["analytics","report-metrics",range], …, {keepPreviousData:true})`; replaced the circular-tile block + removed `metricItems`; `handleAnalyticsUpdate` also invalidates `["analytics","report-metrics",range]`.
- `src/api/reports/types.ts` — added `status?: string` to `ReportQueryState`.

## Corrections vs the original draft
- Dashboard is `src/pages/Dashboard/index.tsx` (not `Dashboard.tsx`); `NotableActivityCard`/deep-link live in `Dashboard/components/`.
- `groupId=none` → `_group:{$in:[null,'']}` (the `{$eq:null}` branch is dead code).
- No reusable count helper existed; totals come from the model methods (now extracted).
- Range resolver is `resolveAnalyticsTimeWindow`; presets are `today`/`last24h`/`last7d`.
- Dedup applies to **all** alert rows, not just Read/Unread (see above).

## Verification (end-to-end)
1. `npm run dev`, open `https://localhost:8000/dashboard`.
2. Metrics card shows Alerts + Social Media, six rows each; loading/empty render.
3. **Parity (critical):** click each row; destination list "Showing X of **N**" equals the count — especially every alert row (all deduped) and the Investigate rows.
4. Switch range pills; counts recompute and stay in parity.
5. `groupId=any` = in-incident only; `groupId=none` = unlinked only; Investigate rows exclude Ignored.
6. **Regression:** `/alerts` and `/mediaposts` list totals unchanged after the `countReportsDedupedTotal` extraction.
