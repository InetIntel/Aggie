# Alerts table — "other fixes"

## Context

The alerts-table spec in
[docs/claude/architecture/alerts-incidents-tables.md](docs/claude/architecture/alerts-incidents-tables.md)
(lines 274–278) lists three follow-up "other fixes" for the Reports/alerts table that
were deferred when the responsive `DataTable` work landed. All three are small,
low-risk corrections to the alerts table's action-button order and column sizing/collapse
tuning. This plan implements those three and keeps the architecture doc in sync.

The three fixes:

1. **Reorder the alert action buttons** so "Add to incident" is the far-left button.
   It renders conditionally (only when a report is not yet in an incident). Today it's
   the last (rightmost) button, so its presence/absence shifts where the *other* buttons
   land — but the button group is `justify-end` (right-aligned). Moving the variable
   button to the left keeps the always-present buttons (read, ignore, investigate) pinned
   flush-right and aligned across every row.
2. **Platform column can be narrower** — ~100px instead of its allotted 140px.
3. **ASN/Network/Geo Scope should remain; let date disappear before it.** Currently date
   is more persistent than the ASN column, so ASN collapses first. Swap their collapse
   priorities so date collapses first and ASN stays. (This intentionally overrides the
   original spec's collapse order, per the "other fixes" note.)

## Changes

### 1. Reorder action buttons — `src/pages/Reports/TableView/ReportsTable.tsx`

In `ReportRowActions` (the flex group at [ReportsTable.tsx:48](src/pages/Reports/TableView/ReportsTable.tsx#L48)),
move the conditional **Add to incident** block (currently
[lines 100–110](src/pages/Reports/TableView/ReportsTable.tsx#L100-L110)) to be the
**first** child of the `<div className='flex items-center justify-end ...'>`, i.e. before
the read/unread `AggieButton` at [line 49](src/pages/Reports/TableView/ReportsTable.tsx#L49).

- Keep it wrapped in `{!report._group && ( ... )}` and keep all its props unchanged.
- Order after the move (left → right): **Add to incident** (when shown) → Read/Unread →
  Ignore → Investigate.
- Leave `<AddReportsToIncidents>` where it is (it renders no inline button) and leave
  `actionsColWidth={216}` unchanged.

Why this works: the group is right-aligned (`justify-end`), so the three always-present
buttons stay pinned to the cell's right edge and line up row-to-row regardless of whether
the variable Add-to-incident button is present.

### 2. Narrow the platform column — `src/pages/Reports/TableView/reportColumns.tsx`

In `buildReportColumns()`, change the `platform` column's `minWidth` from `140` to `100`
([reportColumns.tsx:138](src/pages/Reports/TableView/reportColumns.tsx#L138)). No other
platform-column changes; it stays always-on (no `collapsePriority`).

### 3. Swap date/ASN collapse priorities — `src/pages/Reports/TableView/reportColumns.tsx`

- `source` (ASN / Network / Geo Scope) `collapsePriority: 4` → **`5`**
  ([reportColumns.tsx:163](src/pages/Reports/TableView/reportColumns.tsx#L163)); keep
  `grow: true`.
- `date` `collapsePriority: 5` → **`4`**
  ([reportColumns.tsx:154](src/pages/Reports/TableView/reportColumns.tsx#L154)).

Resulting collapse order (first → last to collapse): signal (1) → status (2) → incident
(3) → **date (4)** → **ASN (5)**; platform never collapses. So the ASN column now
outlives the date column.

Also update the explanatory comment at
[reportColumns.tsx:130-133](src/pages/Reports/TableView/reportColumns.tsx#L130-L133) so
the stated collapse order matches (`signal → status → Incident → date → ASN`).

`DataTable`/`computeFit` read `minWidth`, `collapsePriority`, and `grow` generically
([DataTable.tsx:37-101](src/components/DataTable/DataTable.tsx#L37-L101)); no other file
hardcodes these values, so editing `reportColumns.tsx` is sufficient.

### 4. Keep the architecture doc in sync — `docs/claude/architecture/alerts-incidents-tables.md`

Update the "Reports (alerts) table" section to reflect the new values:
- Platform width `140` → `100` (line ~174).
- Column-list priorities: `source`/ASN `4`→`5`, `date` `5`→`4`; update the stated
  collapse order to `signal → status → Incident → date → ASN`.
- Mark the three alerts "other fixes" (lines 274–278) as addressed (e.g. check them off /
  note them resolved) and record that the button order is now Add-to-incident-first.

## Verification

- `npm run dev` (or `npm run dev:frontend`) and open the Reports/alerts table at
  `https://localhost:8000`.
- **Buttons:** confirm "Add to incident" is the leftmost action button on rows not yet in
  an incident, and that on rows already in an incident (no Add button) the remaining
  read/ignore/investigate buttons stay right-aligned and vertically aligned with the other
  rows.
- **Platform width:** the platform column visibly occupies less horizontal space; ASN
  (the `grow` column) absorbs the freed width.
- **Collapse order:** narrow the window / open the sidebar and shrink the table
  progressively. Confirm the **date** column drops into "More Info" *before* the ASN
  column, and ASN persists after date is gone. Confirm no horizontal overflow at any width.
- No test runner is configured; verification is manual in-app (see CLAUDE.md).

## Notes

- Per your standing preference, on execution this plan file can be moved into
  `docs/claude/plans/`; plan mode currently restricts edits to the harness-designated path.
- Scope is limited to the **alerts** "other fixes" only. The incidents-table "other
  fixes" (lines 314–319) and the global rounded-edges fix (lines 321–324) are out of
  scope for this plan.
