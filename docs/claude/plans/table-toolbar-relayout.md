# Table-view toolbar relayout: move List/Table + Compare into a new row above the table

## Context

The Compare toggle (from the compare-modal feature) was appended into already-full toolbars:

- **Alerts**: it's injected (via the `viewToggle` prop) into the first row of `ReportsFilters` alongside the 320px-min search box, refresh button, and inline `Pagination`. The row is `flex justify-between` with no wrap, so in table view the Compare button pushes the pagination off the right edge — the page scrolls horizontally. This is the known design debt called out in `docs/claude-plans/compare-modal.md`.
- **Incidents**: Compare sits in the page header next to "Create New Incident"; the header is also a no-wrap flex row and can overflow at narrower widths.

**Decision (confirmed with user):** move the **List/Table view toggle and the Compare button into a new row rendered directly above the table** on both pages, and additionally **harden the existing toolbar rows** (flex-wrap + shrinkable search) so nothing can overflow horizontally at any window size.

## Target layout

```
ALERTS (sticky bar, top → bottom)
  Row 1: [Search…] [⟳] [Clear All]                    [‹ Page 1 ›]
  Row 2: [☐/Cancel Sel] [All|Investigate|Ignore]  [Date][Platforms][Entity][Signals]
  Row 3 (multi-select only): [☐] Mark N report(s) as: …
  Row 4 (new, alerts only):  [List|Table]  [⇄ Compare]   ← Compare only in table view
         when compare mode:  [List|Table]  [⇄ Compare*]  Select up to 6… (N selected) [Compare: N] [Cancel]
  ── table / list rows below ──

INCIDENTS
  Header: Incidents [⟳]                              [+ Create New Incident]
  Filters row 1: [Search…][🔍]                        [page count] [‹ Page 1 ›]
  Filters row 2: [Open|Closed|All]            [Creator][Assigned To][…]
  New row:       [List|Table]  [⇄ Compare]   ← Compare only in table view
         when compare mode: …same inline compare controls as alerts…
  ── table / list below ──
```

The new row renders in **both** list and table views (the toggle is needed in list view to get back to table); the Compare button renders only when `view === "table"`. The compare-mode controls ("Select up to N…", **Compare: N**, **Cancel**) move into this same row, inline after the toggle.

## Changes

### 1. Alerts — [src/pages/Reports/AllReportsList.tsx](src/pages/Reports/AllReportsList.tsx)

- Keep the existing `viewToggle` JSX (lines ~133–188: the List/Table `role='group'` + conditional Compare button) but **stop passing it into `<ReportsFilters viewToggle={…}>`**.
- Render it in a **new flex row as the last child of the sticky container** (the `sticky top-0 z-10` div at line ~203), i.e. directly above the `view === "table" ? <ReportsTable> : list` switch. Gate the whole row on `alerts` (mediaposts has no toggle).
- Move the compare-mode block (lines ~237–255: "Select up to {MAX_COMPARE}…", `Compare: N`, `Cancel`) out of the shared toolbar div into this new row, inline after the Compare toggle. The multi-select "Mark N report(s) as:" block stays where it is.
- New row classes: `flex flex-wrap items-center gap-2 mt-2 text-xs font-medium` (matches the existing toolbar styling).

### 2. Alerts — [src/pages/Reports/components/ReportsFilters.tsx](src/pages/Reports/components/ReportsFilters.tsx)

- Remove the `viewToggle` prop from the props interface and the `{viewToggle}` render inside the Formik `<Form>` (line ~193). `AllReportsList` is its only consumer.
- Harden row 1 (line ~164): `flex justify-between mb-2` → add `flex-wrap gap-2 items-center`.
- Search field (line ~179): replace `min-w-[20rem]` with a shrinkable width, e.g. `w-[20rem] max-w-full` (keeps the wide look but lets it shrink instead of forcing overflow).
- Harden row 2 (line ~219): add `flex-wrap gap-y-2` to `flex justify-between text-sm`, and `flex-wrap` on its right-side dropdown group (line ~235).

### 3. Incidents — [src/pages/incidents/index.tsx](src/pages/incidents/index.tsx)

- **Header** (lines ~135–207): remove the List/Table `role='group'` block and the Compare button; keep title + refresh on the left and "Create New Incident" on the right. Add `flex-wrap gap-2` to the header as hardening.
- **New row** between `<IncidentsFilters>` and the `view === "table" ? <IncidentsTable> : …` switch: List/Table toggle (moved from header, same JSX) + Compare button (table view only) + the existing compare-mode block (lines ~218–237) inlined after it. Same row classes as alerts for consistency.

### 4. Incidents — [src/pages/incidents/IncidentsFilters.tsx](src/pages/incidents/IncidentsFilters.tsx)

- Harden row 1 (line ~73) and row 2 (line ~121): add `flex-wrap gap-y-2`; add `flex-wrap` to the right-side filter group (line ~152). The search already shrinks (`max-w-[25em] w-full`), no change needed there.

### 5. Docs

- Update `docs/claude-plans/compare-modal.md`: replace the "⚠️ Known design debt — Compare button placement" section with a short note describing the new placement (toggle + Compare in a dedicated row above the table).
- Update `docs/claude-plans/table-views.md`: the "View toggle" subsections (alerts §"Layout & view toggle", incidents §"View toggle") now describe the dedicated row above the table instead of "in the page header / passed into ReportsFilters via viewToggle"; drop the `viewToggle` prop mention for `ReportsFilters`.

## Notes / gotchas

- `AggieButton` applies `text-nowrap` by default — fine here; wrapping happens at the flex-row level, not inside buttons.
- The new alerts row lives **inside** the sticky bar so the toggle/Compare stay visible while scrolling (consistent with the compare toolbar today).
- Don't touch `Pagination` internals — once the rows wrap and search can shrink, it no longer gets squeezed.
- Mediaposts (`/mediaposts`) renders `AllReportsList` with `alerts=false`: confirm no empty row renders there.

## Verification

1. `npm run dev` → `https://localhost:8000/alerts?view=table`.
2. Confirm the filter bar shows no view toggle/Compare; a new row with **List | Table** and **Compare** sits directly above the table.
3. Narrow the window to ~900px and below: no horizontal scrollbar; pagination stays visible (wraps if needed).
4. Enable Compare, select 2+ alerts: the "Select up to 6… / Compare: N / Cancel" controls appear inline in the new row; modal still opens and footer actions work.
5. Switch to list view: toggle row still present (so you can switch back), Compare hidden; multi-select "Mark as" toolbar unaffected.
6. `/mediaposts`: no toggle row, layout unchanged.
7. `/incidents` (list + `?view=table`): header shows only title/refresh/Create; toggle + Compare in the new row above the table; compare flow works; no horizontal overflow at narrow widths.
