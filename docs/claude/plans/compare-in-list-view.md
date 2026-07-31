# Enable Compare in List View (Alerts + Incidents)

## Context

The side-by-side **Compare** feature currently only works in the **table view** of the
Alerts and Incidents pages. Users want to compare items while in the **list view** too
(the default view for both pages), without having to switch to the table first.

The compare feature is already view-agnostic at the page level — the `CompareActionBar`
and the compare modal (`ReportsCompareModal` / `IncidentsCompareModal`) render purely off
page-level `compareMode` state, and the selection set (`useMultiSelect`) is driven by the
same query results (`reports.results` / `data.results`) that feed *both* views. So the data
and the modal already work regardless of view.

What blocks list-view compare is only the *trigger surface*:
1. The **Compare toggle button** is gated behind `view === "table"` on both pages.
2. The **list rows don't feed selection into the compare set** with the same behavior the
   table uses (cap enforcement + chart prefetch for alerts). The alerts list already has
   checkbox plumbing (reused from the "mark relevant/irrelevant" select mode); the
   incidents list item has no selection support at all.

Goal: turn on the Compare button in list view and make list rows participate in
compare-mode selection, reusing the existing page-level state and modal.

## Files to modify

### 1. `src/pages/Reports/AllReportsList.tsx` (Alerts list)

The alerts list already renders `ReportListItem` with `isChecked` / `isSelectMode` /
`onCheckChange` wired to `multiSelect` (see [AllReportsList.tsx:382-388](src/pages/Reports/AllReportsList.tsx#L382-L388)),
and `toggleCompareMode` already calls `multiSelect.setActive(true)`, so checkboxes appear
in compare mode automatically. Two changes:

- **Show the Compare button in list view.** In `viewToggle`, drop the `view === "table"`
  guard around the Compare `<AggieButton>` ([AllReportsList.tsx:212-225](src/pages/Reports/AllReportsList.tsx#L212-L225))
  so it renders for both list and table (it stays alerts-only, since `viewToggle` is already
  alerts-only). Also move the "Select up to N alerts…" hint so it shows in list mode too
  ([AllReportsList.tsx:334-344](src/pages/Reports/AllReportsList.tsx#L334-L344)).

- **Unify the toggle handler so list selection enforces the cap + prefetch.** Extract the
  table's `selection.onToggle` body ([AllReportsList.tsx:355-368](src/pages/Reports/AllReportsList.tsx#L355-L368))
  into a single `toggleReportForCompare(report)` helper (cap check against `MAX_COMPARE`,
  `prefetchChart` on add, then `multiSelect.addRemove`). Use it in both:
  - the table's `selection.onToggle`, and
  - the list row's `onCheckChange` (currently the bare `multiSelect.addRemove` at
    [AllReportsList.tsx:387](src/pages/Reports/AllReportsList.tsx#L387)) — but only when
    `compareMode` is on; when it's the plain "mark relevant" select mode, keep the current
    uncapped `multiSelect.addRemove`.
  - the list row wrapper's outer `onClick` ([AllReportsList.tsx:376](src/pages/Reports/AllReportsList.tsx#L376)):
    when `compareMode` is on, toggle selection instead of navigating to detail
    (`compareMode ? toggleReportForCompare(report) : onReportItemClick(report._id)`).

No change needed to `CompareActionBar` / `ReportsCompareModal` — they already render on
`compareMode` ([AllReportsList.tsx:421-439](src/pages/Reports/AllReportsList.tsx#L421-L439)).

### 2. `src/pages/incidents/index.tsx` (Incidents list)

- **Show the Compare button in list view.** Drop the `view === "table"` guard around the
  Compare `<AggieButton>` and the hint ([incidents/index.tsx:252-271](src/pages/incidents/index.tsx#L252-L271)).

- **Extract a shared toggle helper** `toggleIncidentForCompare(group)` from the table's
  `selection.onToggle` ([incidents/index.tsx:282-290](src/pages/incidents/index.tsx#L282-L290))
  (cap check + `multiSelect.addRemove`; no prefetch needed for incidents).

- **Feed selection into the list rows.** In the list branch
  ([incidents/index.tsx:294-306](src/pages/incidents/index.tsx#L294-L306)), pass selection
  props to `IncidentListItem`:
  `isChecked={multiSelect.exists(incident)}`, `isSelectMode={multiSelect.isActive}`,
  `onCheckChange={() => toggleIncidentForCompare(incident)}`.

`CompareActionBar` / `IncidentsCompareModal` already render on `compareMode`
([incidents/index.tsx:321-337](src/pages/incidents/index.tsx#L321-L337)) — no change.

### 3. `src/pages/incidents/IncidentListItem.tsx` (add selection support)

This is the only component missing selection UI. Add optional props and reuse the existing
[`MultiSelectListItem`](src/components/MultiSelectListItem.tsx) wrapper (same one the alerts
list uses) so the checkbox styling/behavior matches:

- Add optional props: `isChecked?: boolean`, `isSelectMode?: boolean`,
  `onCheckChange?: () => void`.
- Wrap the item's content in `MultiSelectListItem` when selection props are provided (or
  always, defaulting to non-select mode). `MultiSelectListItem` renders the left checkbox
  gutter in select mode and calls `onCheckChange` with propagation stopped.
- Gate navigation: the inner clickable region uses `onClick={onOpenIncidentPage}`
  ([IncidentListItem.tsx:88-93](src/pages/incidents/IncidentListItem.tsx#L88-L93)). When
  `isSelectMode` is on, route that click to `onCheckChange` (toggle) instead of navigating,
  so clicking the row body selects it — matching the table and the alerts list.
- Watch layout: `IncidentListItem`'s root is a grid `<article>`; `MultiSelectListItem` is
  also an `<article>` that adds a `pl-8`/left gutter in select mode. Verify the incident
  card's `grid-cols-4 lg:grid-cols-6` content still lines up inside the wrapper (the
  wrapper's default padding class is overridable via its `className` prop).

## Reused existing pieces (no new components)

- `useMultiSelect` (`src/hooks/useMultiSelect.ts`) — already page-level, shared by both views.
- `CompareActionBar`, `ReportsCompareModal`, `IncidentsCompareModal`, `CompareModal` — unchanged.
- `MultiSelectListItem` (`src/components/MultiSelectListItem.tsx`) — reused for the incident row.
- `prefetchChart` (`AllReportsList.tsx`) and the `MAX_COMPARE` cap — reused via the extracted handlers.

## Behavior notes / decisions

- The existing `useEffect(..., [view])` on both pages resets `compareMode` + selection when
  switching list↔table ([AllReportsList.tsx:133-139](src/pages/Reports/AllReportsList.tsx#L133-L139),
  [incidents/index.tsx:87-93](src/pages/incidents/index.tsx#L87-L93)). **Keep it** — the
  compare set is cleared on view switch, which avoids any leak and is the simplest correct
  behavior. (Persisting the set across view switches is a possible future enhancement; the
  underlying query is the same for both views so it's feasible, but out of scope here.)
- On alerts, compare mode and the "mark relevant/irrelevant" select mode both use
  `multiSelect.isActive`; they're already mutually exclusive in the UI because the select
  toolbar is gated behind `!compareMode` ([AllReportsList.tsx:288-333](src/pages/Reports/AllReportsList.tsx#L288-L333)).
  This stays correct in list view.
- Social Media Posts page (`AllReportsList` with `alerts=false`) is out of scope — it's
  always list view and `viewToggle`/Compare stays alerts-only.

## Verification

Run the app (`npm run dev`, dev URL `https://localhost:8000`) and, for **both** the Alerts
page (list view) and the Incidents page (list view):

1. Confirm the **Compare** button now appears in list view next to the List/Table toggle.
2. Click **Compare** → checkboxes appear on list rows; the "Select up to N…" hint shows.
3. Select 2–6 rows → the floating **CompareActionBar** appears with the correct count;
   selecting past `MAX_COMPARE` (6) is blocked.
4. Click **Compare N …** → the comparison modal opens with the selected items rendered
   correctly (alerts: charts render — confirm `prefetchChart` warmed them; incidents: summary
   cards + "Impacted ASNs" drill-in work).
5. Remove an item from within the modal → it deselects in the list; clearing all closes it.
6. Toggle List↔Table while in compare mode → selection resets cleanly (no leaked checkboxes).
7. With compare mode **off**, list rows still navigate to detail on click (alerts) / open the
   incident (incidents), and the alerts "mark relevant/irrelevant" select mode still works.
