# Table Views & Compare Modal (Incidents & Alerts)

Both the **Incidents** and **Alerts** pages offer a second "table" view alongside their existing list view, toggled by a `view` URL param. Each row is density-tuned with progressive column hiding as the viewport narrows. Both tables are built on one shared, config-driven `DataTable` component — the Incidents table was the original pattern; the Alerts work extracted `DataTable` and refactored Incidents onto it.

On top of the tables, a **compare modal** lets a user turn on a **Compare** mode, pick several rows, and open a modal that lays the selected items out **side-by-side as full detail cards** so they can be eyeballed together — and, for alerts, acted on (group them into an incident) without leaving the comparison.

- **Incidents** rows are `Group` documents (`GET /api/groups`).
- **Alerts** rows are `Report` documents (media `ioda`/`cloudflare`, `GET /api/report`).

The table chrome is shared; the columns and actions are remapped per page.

---

## Shared component — `DataTable`

- [src/components/DataTable/DataTable.tsx](../../src/components/DataTable/DataTable.tsx) — generic `DataTable<T>`: container, thead, optional leading select column, a **full-width action bar** under each row, expand-row state, empty/loading row.
- [src/components/DataTable/types.ts](../../src/components/DataTable/types.ts) — `DataTableColumn<T>` + `DataTableProps<T>`.

### Layout: Actions column + centered More bar

Each logical row is its own `<tbody>` (valid, and lets the data row + bar + expanded detail group and hover as a unit) containing:

1. the data row — select + data cells + a trailing **Actions** column holding `rowActions` (right-aligned). There is no separate "More Info" column.
2. a **full-width bar** (`<td colSpan>`) with a single centered **More ▾** toggle (rotating caret; label flips More/Less). Rendered when there is expandable content.
3. the expanded detail row (when open).

### Column config & responsive `bucket`

A column declares a responsive `bucket` (`"md" | "lg" | "xl"`); the table derives **both** the hidden cell (`hidden {bucket}:table-cell`) and its "More Info" spillover block (`{bucket}:hidden`) from that single value, so the two can never drift. Columns with no `bucket` are always visible.

Key props:

- `columns` — `DataTableColumn<T>[]`; each has `id`, `header`, `cell(row)`, optional `bucket`, `thClassName`/`tdClassName`, `spilloverLabel`, `noSpillover`.
- `getRowKey(row)` — React key + expand identity.
- `expandedContent(row)` — page-specific detail rendered in the expanded row, **below** the auto-generated spillover blocks for hidden columns.
- `rowActions(row)` — per-row actions, rendered left-aligned in the full-width bar under the row.
- `selection` — `{ isActive, isChecked, onToggle }` adds an optional leading checkbox column.
- `onRowClick(row)`, `rowClassName(row)`, `isLoading`, `emptyMessage`.

### Layout & density

- **Auto layout** (no `table-fixed`) with `w-full` on the `<table>`. `table-fixed` was tried and rejected: under Chromium the flexible text column wouldn't absorb leftover space reliably even with `w-full` on the cell — surplus width leaked out as a phantom band on the right. With auto layout the browser sizes columns to content and the surplus goes to the column with the most text (Title for incidents), which is the desired behavior.
- Other cells keep `w-XX` classes as preferred-width hints; header cells use `whitespace-nowrap` so headers never wrap.
- Cell padding `px-2 py-2`; sublines `text-[12px]`.
- The empty / loading state renders inside the table so the **header is always preserved** (no more "table disappears at 0 rows").
- **Sticky header.** The card is a bounded scroll region (`overflow-auto max-h-[75vh]`) and the header cells are `sticky top-0` (background + bottom border travel with them). This keeps the header pinned as you scroll the rows, and contains horizontal overflow within the card rather than the page. A bounded card was chosen over page-scroll sticky because the alerts filters bar is already `sticky top-0` in `#main_view` and a page-level sticky header would collide with it.

---

## Incidents table

### Files

- [src/pages/incidents/index.tsx](../../src/pages/incidents/index.tsx) — hosts the `view` URL param and the segmented toggle (in a toolbar row directly above the table, with the Compare button); renders the list block or `<IncidentsTable>`. `IncidentsFilters`, `Pagination`, refresh / Create buttons wrap whichever view is active.
- [src/pages/incidents/TableView/IncidentsTable.tsx](../../src/pages/incidents/TableView/IncidentsTable.tsx) — builds the column config + edit/delete dialogs; renders `<DataTable>`.
- [src/pages/incidents/TableView/AsnChips.tsx](../../src/pages/incidents/TableView/AsnChips.tsx) — `Group.impactedAsns` as teal chips with `+N` overflow.
- [src/pages/incidents/TableView/statusFromGroup.ts](../../src/pages/incidents/TableView/statusFromGroup.ts) — derives `"Open" | "Closed" | "In Progress"`.

### Data → columns

Each row is a `Group` ([src/api/groups/types.ts](../../src/api/groups/types.ts)). React key `_id`.

| #   | Column         | bucket | Displayed value                                            | Source on `Group`                          |
| --- | -------------- | ------ | ---------------------------------------------------------- | ------------------------------------------ |
| 1   | ID#            | —      | `#1234`                                                    | `idnum`                                    |
| 2   | Incident Title | —      | Title link to `/incidents/:_id` + "N reports" subline      | `title`, `_reports.length`                 |
| 3   | Start Date     | md     | Date line 1, time line 2 (`YYYY-MM-DD` / `HH:MM` from ISO) | `incidentStartedAt`                        |
| 4   | Status         | —      | `Open` \| `Closed` \| `In Progress`                        | `statusFromGroup` (`closed` + `escalated`) |
| 5   | Alerts Report  | xl     | Red bold count + "alerts" suffix when > 0; grey "0"        | `_reports.length`                          |
| 6   | ASNs Impacted  | lg     | Up to 6 teal chips, then `+N` overflow chip                | `impactedAsns`                             |
| 7   | Assigned To    | xl     | Comma-joined usernames, or `—`                             | `assignedTo[].username`                    |

A trailing **Actions** column holds the pencil (edit dialog) + trash (confirm → delete) actions. Below each row, a **full-width bar** holds the centered **More ▾** toggle, which expands `notes` + `locationName` + any hidden columns. Mutations from [useIncidentMutations.ts](../../src/pages/incidents/useIncidentMutations.ts).

Status derivation: `closed=true → "Closed"`; `escalated=true && !closed → "In Progress"`; else `"Open"`.

### Responsive collapse

Data columns (the action bar is always present below each row):

| Width           | New columns revealed         | Data cols visible |
| --------------- | ---------------------------- | ----------------- |
| `< 768`         | ID, Title, Status            | 3                 |
| `≥ 768` (`md`)  | + Start Date                 | 4                 |
| `≥ 1024` (`lg`) | + ASNs Impacted              | 5                 |
| `≥ 1280` (`xl`) | + Alerts Report, Assigned To | 7                 |

Priority rationale: Alerts Report is lowest priority (the same count is in the Title subline); ASNs Impacted holds longest (down to `lg`) because the chips are the table's main value-add; Assigned To pairs with Alerts Report at `xl`.

### Per-row actions

Rendered in the action bar:

- **Pencil** → `CreateEditIncidentForm` inside `AggieDialog`, wired to `useIncidentMutations().doUpdate`.
- **Trash** → `ConfirmationDialog`, wired to `useIncidentMutations().doRemove`.
- No bulk selection / no header checkbox — per-row only (no `selection` prop). _(Compare mode adds multi-select; see the Compare Modal section.)_

### View toggle

`view` is a URL param via `useQueryParams` (`?view=table` survives reload). The toggle is a small segmented control of two `AggieButton`s in a toolbar row directly above the table/list (below `IncidentsFilters`), alongside the **Compare** button (table view only) and the inline compare-mode controls. The page header holds only the title, refresh, and Create New Incident.

---

## Alerts table

### Files

- [src/pages/Reports/TableView/ReportsTable.tsx](../../src/pages/Reports/TableView/ReportsTable.tsx) — assembles columns + selection + row actions + expand content, renders `<DataTable>`. `ReportRowActions` subcomponent owns its per-row "Add to Incident" modal.
- [src/pages/Reports/TableView/reportColumns.tsx](../../src/pages/Reports/TableView/reportColumns.tsx) — column defs + cell components (`PlatformCell`, `StatusCell`, `SignalCell`, `IncidentCell`) and helpers (`reportSource`, `reportSignal`).
- [src/pages/Reports/AllReportsList.tsx](../../src/pages/Reports/AllReportsList.tsx) — hosts the `view` URL param + segmented toggle; renders `<ReportsTable>` vs the list block. Strips `view` from the API query/key. Owns the list view's `expandedId` (single open at a time).
- [src/pages/Reports/index.tsx](../../src/pages/Reports/index.tsx) — wrapper is **full-width for both views** (the persistent right detail column is retired). A deep link to `/alerts/:id` (or `/mediaposts/:id`) still renders the standalone detail in a right slide-over drawer as a fallback.
- [src/pages/Reports/components/ReportsFilters.tsx](../../src/pages/Reports/components/ReportsFilters.tsx) — search/refresh/pagination + filter rows (`flex-wrap` hardened; the view toggle no longer renders here).
- [src/pages/Reports/Report/ReportDetail.tsx](../../src/pages/Reports/Report/ReportDetail.tsx) — **shared presentational detail** (action toolbar + `SocialMediaPost`, marks read on view). Used inline by both the list (`ReportListItem`) and table (expand panel), and by the standalone `/alerts/:id` route ([Report/index.tsx](../../src/pages/Reports/Report/index.tsx), now a thin fetch-by-id wrapper).
- [src/pages/Reports/components/ReportListItem.tsx](../../src/pages/Reports/components/ReportListItem.tsx) — optional `isExpanded`/`onToggleExpand` props add a "View details" toggle that renders `<ReportDetail>` inline (alerts/mediaposts list).

Table view is **alerts-only** — the same components serve `/mediaposts`, where the toggle is suppressed and the list always shows.

### Data → columns

Each row is a `Report` ([src/api/reports/types.ts](../../src/api/reports/types.ts)). React key `_id`.

| Column   | bucket | Displayed value                                                                                                 | Source on `Report`                            |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Select   | —      | checkbox (only in multi-select mode)                                                                            | `useMultiSelect`                              |
| Platform | —      | `SocialMediaIcon`                                                                                               | `_media[0]`                                   |
| Content  | —      | `line-clamp-2` text (row click is **reserved for a future compare modal** — detail opens via the expand toggle) | `content` via `formatText`                    |
| Status   | —      | Unread/Read + Ignore/Investigate token                                                                          | `read`, `irrelevant`                          |
| Date     | md     | `DateTime`                                                                                                      | `authoredAt`                                  |
| Source   | lg     | "IODA" / cloudflare `dataSource` / source nickname                                                              | `reportSource` (mirrors `renderAuthor`)       |
| Incident | lg     | linked incident chip `#idnum` or "—"                                                                            | `_group` → `getGroup` (lazy `useQuery`)       |
| Signal   | xl     | datasource badge (BGP / Active Probing / Telescope)                                                             | `metadata.rawAPIResponse.rawEvent.datasource` |

A trailing **Actions** column holds the icon actions (Read/Unread · Ignore · Investigate · Add to Incident — icon-only, `useReportMutations` + `AddReportsToIncident`). Below each row, a **full-width bar** holds the centered **More ▾** toggle, which expands the inline **full alert detail** (`ReportDetail`) + any hidden columns.

### Responsive collapse

Platform, Content, Status (and Select when active) are always visible; the action bar is always present. Hidden columns reappear inside the expanded panel.

| Width           | Columns added             |
| --------------- | ------------------------- |
| `< 768`         | Platform, Content, Status |
| `≥ 768` (`md`)  | + Date                    |
| `≥ 1024` (`lg`) | + Source, Incident        |
| `≥ 1280` (`xl`) | + Signal                  |

### Clicking an alert → inline detail

Both the list and table reveal an alert's **full detail inline** rather than in a side panel:

- The detail body is the shared `ReportDetail` (action toolbar + `SocialMediaPost` event card), which also marks the report read when shown.
- **Table:** the centered **More ▾** toggle in the row's action bar expands it; `DataTable`'s `expandedContent` renders `<ReportDetail>` (plus auto-spillover for any hidden columns).
- **List:** `ReportListItem` shows a "View details" toggle that expands `<ReportDetail>` beneath the item; `AllReportsList` tracks a single `expandedId`.
- **Row click is intentionally left unwired** — reserved for the **compare modal** (see below). Detail opens only via the explicit expand toggle. Because row-click now toggles inline detail, compare uses the toggle/checkbox path, **not** row-click.

### Per-row & bulk actions

- Per-row (via `useReportMutations({ key: reportsQueryKey })`): Read/Unread (`setRead`), Ignore/Investigate (`setIrrelevance` toggling to `maybe`), Add to Incident (`AddReportsToIncident` modal, shown only when not already in an incident).
- Bulk: the existing `MultiSelectActions` toolbar in `AllReportsList` still drives multi-select; the table's leading checkbox column wires into the same `useMultiSelect`.

### Layout & view toggle

- `view` param resolved three-tier: URL (`?view=table`) → `localStorage["alerts:view"]` → default `list`. `view` is stripped from the report query (key + request) so toggling never refetches.
- Toggle: two `AggieButton`s (`faList`/`faTable`, `override`, `role="group"`), rendered in a toolbar row at the bottom of the sticky filter bar, directly above the table/list. The **Compare** button (table view only) and the inline compare-mode controls share this row. The filter rows above it are `flex-wrap` hardened and the search input shrinks, so nothing overflows horizontally.
- Full-width: both views render `main` at full width — the permanent right detail column is retired in favor of inline expansion. A deep link to `/alerts/:id` still opens the standalone detail in a slide-over drawer (backdrop click → back to the base path, preserving filters).

---

## Compare Modal (Alerts & Incidents)

### Context / essence

The alerts and incidents table views above let a user scan rows and expand one row's detail inline. The compare modal is the next step: a user turns on a **Compare** mode, picks several rows, and opens a modal that lays the selected items out **side-by-side as full detail cards** so they can be eyeballed together — and, for alerts, acted on (group them into an incident) without leaving the comparison.

- **Alerts compare with alerts; incidents compare with incidents.** No cross-type comparison.
- Up to **`MAX_COMPARE`** of each type in one comparison (cap is **6** per type).
- Layout is **side-by-side full detail** (reuse the existing detail renderers), per the provided design.

> Status: **implemented** for both alerts (with create/add-to-incident footer) and incidents (read-only). Cap is **6** per type; footer acts on the highlighted subset (fallback to all). The Compare-button placement design debt is resolved (see below).

### The design (from the provided mockup — alerts)

A large centered modal over a dimmed backdrop, **✕ close** top-right. Body is a **responsive grid of detail cards, 3 per row** (mock shows 6 cards in a 3×2 grid). Each alert card reuses the existing alert presentation:

- Header row: platform icon (IODA), **Open Post ↗**, and a **⋯ overflow menu** (per-card actions, e.g. remove-from-comparison / read / ignore).
- Body: the IODA/Cloudflare event detail — region title, Start / End / Duration, signal badge (e.g. _Active Probing_), the time-series chart, and "Updated: …".

**Two selection layers:**

1. **Table layer** — Compare mode + checkboxes pick _which items appear_ in the modal (the compare set).
2. **In-modal layer** — clicking a card toggles a **highlight ring** (yellow/green in the mock) marking it for the footer actions.

**Footer action bar** (alerts) — two full-width buttons reflecting the in-modal highlighted count:

- **Create new incident (N alerts)**
- **+ Add to incident (N alerts)**

### Uniform card sizing (modal shrinks to fit)

Every card has a **fixed, uniform height** (`h-[38vh]` — the height a card has in the 4-alert/2-row `lg` layout), and the modal panel is `max-h-[90vh]` so it **shrinks to fit** the number of cards: ≤3 alerts render one short row and the modal is correspondingly short (no stretched cards, no tall empty box); 4–6 render a 3×2 grid that fills toward 90vh. The grid applies `text-xs` so card text shrinks via inheritance, and compact mode tightens card padding/margins and overrides the few hard-coded `text-sm` bits (author date, reactions, IODA signal badge). Overflow always scrolls **within a card**; the body only scrolls as a safety net on unusually short screens. `38vh` is the single sizing knob — nudge 36–40vh to match the 4-alert cards.

How it's wired:

- **Shell** ([CompareModal.tsx](../../src/components/CompareModal/CompareModal.tsx)): panel `max-h-[90vh] flex flex-col`; body `flex-1 min-h-0 overflow-y-auto` (safety scroll only); grid `grid … gap-2 text-xs` (no `h-full`/`auto-rows-fr`); each cell `min-h-0 h-[38vh]`.
- **Alert card** ([CompareAlertCard.tsx](../../src/pages/Reports/TableView/CompareAlertCard.tsx)): root `h-full min-h-0 flex flex-col`; renders `SocialMediaPost` with its **`compact` prop** (used only here, default off — `ReportDetail` and all other consumers unchanged). Compact `SocialMediaPost` fills its slot (`h-full flex flex-col overflow-hidden`), the post body becomes the per-card scroll region (`flex-1 min-h-0 overflow-y-auto`), and the header/"updated:" footer stay pinned.
- **Charts** are bounded to a uniform height: the IODA inline SVG via `[&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-52` ([IodaEvent.tsx](../../src/components/SocialMediaPost/IodaEvent.tsx)) and the Cloudflare `<img>` via `max-h-52 object-contain` ([TrafficEvent.tsx](../../src/components/SocialMediaPost/TrafficEvent.tsx)). ⚠️ **Unverified against live data:** CSS scaling of the IODA SVG preserves aspect ratio only if the API's SVG markup carries a `viewBox`; if charts render squashed, switch the existing string-replacement in `IodaEvent` (the `width="726"`→`100%` rewrites) to emit explicit compact dimensions instead.
- **Incident card** ([CompareIncidentCard.tsx](../../src/pages/incidents/TableView/CompareIncidentCard.tsx)): root `h-full min-h-0 flex flex-col overflow-hidden`; the Notes block is the flexible region (`flex-1 min-h-0 overflow-y-auto`) so long notes scroll inside the card.
- **Non-goals:** `MediaPreview` (`min-h-[30vh]`) untouched — compare is alerts-only (ioda/cloudflare), which never renders it, and the compact scroll wrapper contains it anyway; no change to `useMultiSelect`, footer actions, or highlight behavior.

### Trigger & selection flow

- A **Compare** toggle button next to the List/Table view toggle — both live in a dedicated row directly above the table on both pages — turns on compare-select mode.
- Selection reuses the existing **`useMultiSelect`** hook ([src/hooks/useMultiSelect.ts](../../src/hooks/useMultiSelect.ts)) and `DataTable`'s `selection` prop (`isActive`/`isChecked`/`onToggle`), already wired for alerts in [AllReportsList.tsx](../../src/pages/Reports/AllReportsList.tsx). Cap selection at `MAX_COMPARE`.
- A **Compare (N)** button (enabled at ≥2 selected) opens the modal with `multiSelect.selection`.
- Note: row-click now toggles inline detail, so compare must use the toggle/checkbox path, **not** row-click.

### Component architecture

A generic shell, type-specific cards (folders define scope):

- **`src/components/CompareModal/CompareModal.tsx`** — generic `CompareModal<T>` built on **`AggieDialog`** ([src/components/AggieDialog.tsx](../../src/components/AggieDialog.tsx)) with a wide, tall, scrollable panel (e.g. `w-full max-w-7xl max-h-[90vh]`). Props: `items: T[]`, `getKey(item)`, `renderCard(item, { isHighlighted, onToggleHighlight })`, optional `footer(highlightedItems)`, `isOpen`, `onClose`, `title`. Owns the **in-modal highlight set** state.
- **Alerts** — `src/pages/Reports/TableView/CompareAlertCard.tsx`: wraps **`SocialMediaPost`** ([src/components/SocialMediaPost/index.tsx](../../src/components/SocialMediaPost/index.tsx)) `showMedia`, plus the ⋯ overflow menu and the highlight ring. A `ReportsCompareModal` supplies the footer.
  - **Reuse `SocialMediaPost` directly, NOT `ReportDetail`** — `ReportDetail` marks reports **read on view** ([ReportDetail.tsx](../../src/pages/Reports/Report/ReportDetail.tsx) lines 47-59); rendering N of them would silently mark all read. `SocialMediaPost` is purely presentational.
- **Incidents** — `src/pages/incidents/TableView/CompareIncidentCard.tsx`: a presentational incident summary. `IncidentInfo` ([src/pages/incidents/Incident/IncidentInfo.tsx](../../src/pages/incidents/Incident/IncidentInfo.tsx)) is presentational but verbose and fetches ASN metadata inline; extract a lighter summary (title `#idnum`, status, time range, impacted ASNs, notes) for a compare column. **Read-only for v1, no footer actions** (a "merge incidents" footer is a future option).

### Footer actions (alerts) — reuse existing flows

Both already exist in [AddReportsToIncident.tsx](../../src/pages/Reports/components/AddReportsToIncident.tsx):

- **Create new incident (N)** → navigate to `/incidents/new?reports=<id:id:…>` (mirror `onNewIncidentFromReports`, line 94).
- **Add to incident (N)** → open the existing **`AddReportsToIncidents`** modal with the highlighted reports as `selection` (it lists incidents and calls `setReportsToGroup`).

Footer counts and the ids passed come from the **in-modal highlighted** cards, not the full compare set.

### Reuse map

| Need               | Reuse                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Modal container    | `AggieDialog`                                                        |
| Selection state    | `useMultiSelect`, `DataTable` `selection` prop                       |
| Alert card body    | `SocialMediaPost` (`showMedia`, presentational, no read side-effect) |
| Incident card body | extract a light summary from `IncidentInfo`                          |
| Add-to-incident    | `AddReportsToIncidents` (`setReportsToGroup`)                        |
| Create-incident    | `/incidents/new?reports=…` route                                     |

### Compare button placement (debt resolved)

The earlier overflow problem (Compare appended into the crowded `ReportsFilters` top row, pushing the inline `Pagination` off-screen; incidents had it crammed into the page header) is fixed: on **both pages** the List/Table view toggle and the Compare toggle now live in a **dedicated toolbar row directly above the table**, and the compare-mode controls ("Select up to N…", **Compare: N**, **Cancel**) render inline in that same row when compare mode is on. The filter rows and headers were also hardened with `flex-wrap` (and a shrinkable search input on alerts) so they wrap instead of overflowing at narrow widths.

### Verification (of the compare feature)

- `npm run dev` → `/alerts?view=table`: enable Compare, select 2-5 alerts, open the modal; cards render side-by-side; highlighting cards updates the footer counts; **Create new incident** lands on `/incidents/new` pre-filled; **Add to incident** opens the incident picker and assigns. Confirm opening the modal does **not** mark the alerts read.
- `/incidents?view=table`: Compare 2-5 incidents → read-only side-by-side summaries.
- Sizing: with 6 alerts the modal fills toward 90vh with **no modal scrollbar** and a 3×2 grid of identical `38vh` cards (charts shrink to fit); with 2–3 items the cards are the **same height** (not stretched) and the modal **shrinks** to a short, centered box; an incident with long notes scrolls inside its card only. Spot-check `/alerts/:id` to confirm non-compact `SocialMediaPost` is unchanged.

---

## ⚠️ Known design debt (Alerts) — needs a future polish pass

**The Alerts table is functional but not visually finished.** It was iterated quickly to stop horizontal-overflow bugs, and several compromises were made to fit the columns + actions into the available width. It works, but it doesn't look great yet and should get a proper design pass before it's considered done. Specifics:

- **Icon-only actions rely on tooltips.** The four per-row actions are icon-only (now in the action bar); their meaning depends on hover tooltips (`title`/`aria-label`). Readable but not self-evident — labels or a clearer affordance would help.
- **Action bar adds height.** The full-width bar under every row adds vertical space, so the table is taller/less dense than a pure column layout. Intentional, but worth revisiting if density matters.
- **Aggressive shrinking.** Several columns were made to shrink hard to fit: Content uses `[overflow-wrap:anywhere]` (long URLs/tokens break so the column can collapse), Source/Incident `truncate` with small `max-w`, and column width hints (`w-24`/`w-28`/`w-32`) were trimmed. Functional but visually rough; spacing and density deserve a deliberate redesign.
- **Inline detail styling.** The expanded `ReportDetail` renders inside the generic expand row (teal-tinted in the table) and inside a bordered panel in the list. It reuses the standalone detail layout as-is; the inline framing/spacing hasn't been designed for these contexts and looks provisional.
- **Bounded scroll card.** The `DataTable` card is `overflow-auto max-h-[75vh]` (for the sticky header), so long tables get an inner scrollbar distinct from the page scroll, and any residual horizontal overflow scrolls within the card. The `75vh` cap is a guess — revisit if it leaves awkward empty space or feels cramped.
- **Responsive buckets are best-effort.** The breakpoints at which columns appear were tuned by hand to avoid overflow, not chosen for information priority. A design pass should reconsider which columns matter most and when they should appear.
- **Add alert images.** Tweak the rows to also include the image from the source when the user expands "More Info".

When revisiting: consider whether the alert row is better served by a denser custom layout than a generic column table, and whether the actions belong in an overflow menu. The underlying `DataTable` is flexible enough to support either direction.

---

## Future-tweak hooks

- Move a column between breakpoints: change its `bucket` once (`DataTable` derives the cell + spillover).
- `AsnChips` `max` prop (default 6) and container `max-w-[160px]`.
- Bump the incidents "all visible" threshold to `2xl` (1536 px) if `xl` feels cramped.
- Reuse `DataTable` for a future social-posts (`/mediaposts`) table — pass a different column config.
- The alert detail drawer width is `max-w-xl`; bump if the report detail feels cramped.
- `rowActions` render in a trailing Actions column; the centered **More ▾** bar renders whenever there is expandable content. Both live in `DataTable`.
- If long incident titles ever blow up the Title column under auto-layout, add `break-words` / `max-w-[...]` to the Title `<td>` (or `[overflow-wrap:anywhere]`, as used on the alert Content column).
- Compare sizing: `38vh` card height is the single knob — nudge 36–40vh to match the 4-alert cards.

---

## Open follow-ups

- Incidents: Status column header overlaps the title around ~600 px width — unresolved.
- Incidents: "N reports" subline text is very small; bump size.
- Populate real incident data end-to-end so the table isn't rendering against placeholder rows.
- **Add signal sources to the incidents compare modal** (noted 2026-06-10): `CompareIncidentCard` should surface the signal source(s) of the incident's member reports — the datasource badges (BGP / Active Probing / Telescope) from each report's `metadata.rawAPIResponse.rawEvent.datasource`, as shown in the alerts table's Signal column (reuse the badge styling from `SignalCell` in [reportColumns.tsx](../../src/pages/Reports/TableView/reportColumns.tsx)). Likely an aggregate of distinct values across the group's `_reports`.

---

## Compare feature — remaining todos

- Make the incident compare modal cards look like the alerts cards.
- ~~Change the size of the create incident / add to incident buttons on the compare modal.~~ **Done** — footer buttons dropped from `py-3 text-base` to `py-2 text-sm` in [ReportsCompareModal.tsx](../../src/pages/Reports/TableView/ReportsCompareModal.tsx).
- ~~Work on the UX of the compare feature leading into actually launching the compare.~~ **Done** — see "Compare launch UX" below.
- ~~Ensure the compare function automatically deactivates when switching back to the list view.~~ **Done** — see "Compare polish pass" below.
- Investigate why Cloudflare alerts aren't showing in the alerts list, only IODA (odd — worth checking).

### Open questions to confirm (compare modal)

1. **Cap**: implemented as **6** per type (`MAX_COMPARE`); user originally said up to 5, mock shows 6 — confirm 6 is final.
2. **Footer target**: confirm footer acts on the **highlighted subset** (mock's "(2 alerts)") vs. the whole compare set. _(Currently: highlighted subset, fallback to all.)_
3. **⋯ overflow menu** contents per card (remove-from-comparison only, or also read/ignore/investigate via `useReportMutations`?).
4. **Incidents footer**: none for v1 (read-only), or a future action (e.g. merge incidents)?

## Compare polish pass (resolved)

The following usability defects were fixed in one pass. Files: [AllReportsList.tsx](../../src/pages/Reports/AllReportsList.tsx), [incidents/index.tsx](../../src/pages/incidents/index.tsx), [CompareModal.tsx](../../src/components/CompareModal/CompareModal.tsx), [CompareActionBar.tsx](../../src/components/CompareModal/CompareActionBar.tsx) (new), [CompareCardBody.tsx](../../src/pages/Reports/TableView/CompareCardBody.tsx), [CompareAlertCard.tsx](../../src/pages/Reports/TableView/CompareAlertCard.tsx), [ReportsCompareModal.tsx](../../src/pages/Reports/TableView/ReportsCompareModal.tsx).

## List view todos (table view + shared chrome pass — mostly resolved)

Scope note: this pass was constrained to the **table view and components shared by both views** — nothing list-view-specific was touched. The list view's right detail panel keeps its full (non-compact) size; it only inherits the shared-component fixes (single title + normalized badge).

Resolved:

- **Detail "dropdown" too large / confusing colors** — the table's inline expanded detail now renders `ReportDetail` in **compact** mode (new `compact` prop on [ReportDetail.tsx](../../src/pages/Reports/Report/ReportDetail.tsx), passed from [ReportsTable.tsx](../../src/pages/Reports/TableView/ReportsTable.tsx); reuses the compare-modal `compact` path through `SocialMediaPost`). The `DataTable` expand row was de-tinted from teal to neutral slate ([DataTable.tsx](../../src/components/DataTable/DataTable.tsx)).
- **Duplicate titles in the dropdown** — `IodaEvent` printed the region title again as an `<h2>` on top of the `SocialMediaPost` header author. Removed ([IodaEvent.tsx](../../src/components/SocialMediaPost/IodaEvent.tsx)).
- **"Active Probing" label weirdly spaced** — the IODA badge omitted `font-medium` and used `p-1`/`p-0.5`, unlike the two other badge sites. Normalized via a shared `SIGNAL_BADGE_BASE`/`SIGNAL_BADGE_CLASS` in [reportParser.ts](../../src/components/SocialMediaPost/reportParser.ts), now imported by `IodaEvent`, `SignalCell` ([reportColumns.tsx](../../src/pages/Reports/TableView/reportColumns.tsx)), and `SocialMediaListItem`.
- **Search/refresh/pagination on one line; "clear all" shoved pagination down** — the top toolbar row ([ReportsFilters.tsx](../../src/pages/Reports/components/ReportsFilters.tsx)) dropped `flex-wrap` and pinned Pagination with `shrink-0`, so Reset no longer wraps the row.
- **"Clear All Parameters" verbage** — renamed to **"Reset filters"**. (Note: refresh and reset were always independent — refresh only refetches; the layout just made them look coupled.)
- **"Keyword Search" → "Search"**, and the icon-only refresh is now a labeled **"Refresh"** button (`variant='secondary'`).
- **Checkbox jammed into the filters** — the bulk-select entry is now a labeled **"Select"** button in its own divider-separated group, visually distinct from the All/Investigate/Ignore relevance filter. Entering select mode no longer silently selects all 50 on entry.
- **"all" only targets the current page** — the in-mode select-all is relabeled **"Select all on this page (N)"** to make the current-page scope explicit.

Not done (deferred / out of this scope):

- The **list view's** own detail panel size/colors were intentionally left untouched (list-view-specific).
- No cross-page "select all matching" was added (would need backend support); current-page-only was kept and relabeled.
