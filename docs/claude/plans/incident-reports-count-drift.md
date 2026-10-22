# Finding: Incident alert count > alerts shown on expand (stale `_reports`)

## Symptom

Incident **#14** (`_id=6a4c18ca39cc1b1d8d469aa9`, title "incident 6") shows **12 reports**
in the incidents table, but expanding the row lists only **4** alerts.

## Root cause

The count and the list come from two different sources:

- **The "12" label** is the group's stored `_reports.length` (mirrored in `reportsLength`).
  See `backend/models/group.js:108,112-115` and the table cell in
  `src/pages/incidents/TableView/IncidentsTable.tsx` (`inc._reports?.length`).
- **The expanded list** is fetched live from `/api/report?groupId=<id>`
  (`getGroupReports` → `src/api/groups/index.ts:79`), which queries reports by their
  `_group` field (`report_reports` → `Report.queryReports`, filter `_group: groupId`).

Read-only DB inspection of incident #14:

```
stored _reports.length = 12   reportsLength = 12
reports with _group == this incident = 4
stored ids that still exist = 4   (missing/deleted = 8)
  of existing stored: _group==14 = 4 | _group==other = 0 | _group==null = 0
reports _group==14 but NOT in stored _reports = 0
```

**8 of the 12 ObjectIds in `_reports` point to report documents that no longer exist.**
The reports were deleted out-of-band (a partial dev reseed / manual deletion), but the
group's `_reports` array (and `reportsLength`) was never decremented. So the count reads a
stale array length while the expand correctly returns the 4 reports that still exist.

This is **not** access-control filtering, **not** dedup, **not** pagination, and **not**
report reassignment — the missing reports are simply gone.

## Scope

Across all 8 incidents in this DB, only **#14** has drift (stored 12 vs live 4). Isolated —
consistent with dev-data drift, not a systemic bug. The app's own attach/detach paths keep
both sides in sync:

- `attachReportsToGroup` sets `report._group` **and** pushes to `group._reports`, and pulls
  from the previous group's `_reports` (`backend/api/utils/reportGroupActions.js:9-74`).
- `removeReportsFromGroup` clears `report._group` **and** pulls from `_reports` (`:76-113`).

The one asymmetric path is `clearGroupFromReports` (`:115-135`, used by
`deleteGroupAndUnlinkReports` in `groupController.js:879-886`): it clears `report._group`
without pulling from any `group._reports`. That only runs on **group deletion**, so it
can't explain live drift on an existing group — but it's the shape of bug to watch for. No
active hard-delete-a-report endpoint exists (the `/api/report/_all` route is commented out
in `reportController.js:411-420`).

## Options (all write to the DB — require explicit go-ahead)

1. **Reconcile #14 only** *(recommended)* — prune the 8 dead ids from `_reports` and set
   `reportsLength = 4`. The label then matches the 4 shown.
2. **Maintenance script** — reconcile any incident whose `_reports.length` ≠ live
   `countDocuments({ _group })` (only #14 needs it now). Prune dead ids and recompute
   `reportsLength`. Keep as a repeatable dev/ops utility.
3. **Leave it** — treat as isolated dev-data drift.

## Optional hardening (code)

If report hard-deletion is ever reintroduced, make the delete path pull the report id from
its `group._reports` and recompute `reportsLength` (or derive the displayed count from live
`_group` reports instead of the stored array) so the count can't go stale again.

## Verification (read-only)

Reproduce the numbers with a read-only Mongo script that, for `groups.idnum == 14`, compares
`group._reports.length` against `reports.countDocuments({ _group: group._id })` and counts how
many stored ids still exist. (Ad-hoc script used during investigation; not committed.)
