# Compare Modal (Alerts & Incidents)

## Context / essence

The alerts and incidents **table views** (see [table-views.md](./table-views.md)) let a user scan rows and expand one row's detail inline. The next step is a **compare modal**: a user turns on a **Compare** mode, picks several rows, and opens a modal that lays the selected items out **side-by-side as full detail cards** so they can be eyeballed together — and, for alerts, acted on (group them into an incident) without leaving the comparison.

- **Alerts compare with alerts; incidents compare with incidents.** No cross-type comparison.
- Up to **5 of each** type in one comparison *(design mock shows 6 — final cap to confirm; implement as a constant `MAX_COMPARE`)*.
- Layout is **side-by-side full detail** (reuse the existing detail renderers), per the provided design.

> Status: **planning doc only** — the modal is not built yet. The implementation phases below are the proposed build order.

## The design (from the provided mockup — alerts)

A large centered modal over a dimmed backdrop, **✕ close** top-right. Body is a **responsive grid of detail cards, 3 per row** (mock shows 6 cards in a 3×2 grid). Each alert card reuses the existing alert presentation:

- Header row: platform icon (IODA), **Open Post ↗**, and a **⋯ overflow menu** (per-card actions, e.g. remove-from-comparison / read / ignore).
- Body: the IODA/Cloudflare event detail — region title, Start / End / Duration, signal badge (e.g. *Active Probing*), the time-series chart, and "Updated: …".

**Two selection layers:**

1. **Table layer** — Compare mode + checkboxes pick *which items appear* in the modal (the compare set).
2. **In-modal layer** — clicking a card toggles a **highlight ring** (yellow/green in the mock) marking it for the footer actions.

**Footer action bar** (alerts) — two full-width buttons reflecting the in-modal highlighted count:

- **Create new incident (N alerts)**
- **+ Add to incident (N alerts)**

## Trigger & selection flow

- A **Compare** toggle button in the table toolbar (next to the List/Table view toggle for alerts; a new toolbar control for incidents) turns on compare-select mode.
- Selection reuses the existing **`useMultiSelect`** hook ([src/hooks/useMultiSelect.ts](../../src/hooks/useMultiSelect.ts)) and `DataTable`'s `selection` prop (`isActive`/`isChecked`/`onToggle`), already wired for alerts in [AllReportsList.tsx](../../src/pages/Reports/AllReportsList.tsx). Cap selection at `MAX_COMPARE`.
- A **Compare (N)** button (enabled at ≥2 selected) opens the modal with `multiSelect.selection`.
- Note: row-click now toggles inline detail (see [table-views.md](./table-views.md)), so compare must use the toggle/checkbox path, **not** row-click.

## Component architecture

A generic shell, type-specific cards (folders define scope):

- **`src/components/CompareModal/CompareModal.tsx`** — generic `CompareModal<T>` built on **`AggieDialog`** ([src/components/AggieDialog.tsx](../../src/components/AggieDialog.tsx)) with a wide, tall, scrollable panel (e.g. `w-full max-w-7xl max-h-[90vh]`). Props: `items: T[]`, `getKey(item)`, `renderCard(item, { isHighlighted, onToggleHighlight })`, optional `footer(highlightedItems)`, `isOpen`, `onClose`, `title`. Owns the **in-modal highlight set** state.
- **Alerts** — `src/pages/Reports/TableView/CompareAlertCard.tsx`: wraps **`SocialMediaPost`** ([src/components/SocialMediaPost/index.tsx](../../src/components/SocialMediaPost/index.tsx)) `showMedia`, plus the ⋯ overflow menu and the highlight ring. A `ReportsCompareModal` supplies the footer.
  - **Reuse `SocialMediaPost` directly, NOT `ReportDetail`** — `ReportDetail` marks reports **read on view** ([ReportDetail.tsx](../../src/pages/Reports/Report/ReportDetail.tsx) lines 47-59); rendering N of them would silently mark all read. `SocialMediaPost` is purely presentational.
- **Incidents** — `src/pages/incidents/TableView/CompareIncidentCard.tsx`: a presentational incident summary. `IncidentInfo` ([src/pages/incidents/Incident/IncidentInfo.tsx](../../src/pages/incidents/Incident/IncidentInfo.tsx)) is presentational but verbose and fetches ASN metadata inline; extract a lighter summary (title `#idnum`, status, time range, impacted ASNs, notes) for a compare column. **Read-only for v1, no footer actions** (a "merge incidents" footer is a future option).

## Footer actions (alerts) — reuse existing flows

Both already exist in [AddReportsToIncident.tsx](../../src/pages/Reports/components/AddReportsToIncident.tsx):

- **Create new incident (N)** → navigate to `/incidents/new?reports=<id:id:…>` (mirror `onNewIncidentFromReports`, line 94).
- **Add to incident (N)** → open the existing **`AddReportsToIncidents`** modal with the highlighted reports as `selection` (it lists incidents and calls `setReportsToGroup`).

Footer counts and the ids passed come from the **in-modal highlighted** cards, not the full compare set.

## Reuse map

| Need | Reuse |
| --- | --- |
| Modal container | `AggieDialog` |
| Selection state | `useMultiSelect`, `DataTable` `selection` prop |
| Alert card body | `SocialMediaPost` (`showMedia`, presentational, no read side-effect) |
| Incident card body | extract a light summary from `IncidentInfo` |
| Add-to-incident | `AddReportsToIncidents` (`setReportsToGroup`) |
| Create-incident | `/incidents/new?reports=…` route |

## Open questions to confirm before building

1. **Cap**: user said up to **5** each; mock shows **6**. Pick the `MAX_COMPARE` value.
2. **Footer target**: confirm footer acts on the **highlighted subset** (mock's "(2 alerts)") vs. the whole compare set.
3. **⋯ overflow menu** contents per card (remove-from-comparison only, or also read/ignore/investigate via `useReportMutations`?).
4. **Incidents footer**: none for v1 (read-only), or a future action?
5. **Compare toggle placement** for incidents (incidents table has no multi-select today — it must be added, mirroring `ReportsTable`).

## Implementation phases (future)

1. Generic `CompareModal<T>` shell (AggieDialog-based) + in-modal highlight state.
2. Alerts: Compare toggle + `Compare (N)` entry in the alerts toolbar; `CompareAlertCard`; `ReportsCompareModal` with footer wired to the two existing flows.
3. Incidents: add `selection`/multi-select to `IncidentsTable` (mirror `ReportsTable`); `CompareIncidentCard`; read-only `IncidentsCompareModal`.

## Verification (of the eventual feature)

- `npm run dev` → `/alerts?view=table`: enable Compare, select 2-5 alerts, open the modal; cards render side-by-side; highlighting cards updates the footer counts; **Create new incident** lands on `/incidents/new` pre-filled; **Add to incident** opens the incident picker and assigns. Confirm opening the modal does **not** mark the alerts read.
- `/incidents?view=table`: Compare 2-5 incidents → read-only side-by-side summaries.
