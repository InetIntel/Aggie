# Table Views (Incidents & Alerts)

Both the **Incidents** and **Alerts** pages offer a second "table" view alongside their existing list view, toggled by a `view` URL param. Each row is density-tuned with progressive column hiding as the viewport narrows. Both tables are built on one shared, config-driven `DataTable` component — the Incidents table was the original pattern; the Alerts work extracted `DataTable` and refactored Incidents onto it.

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

- [src/pages/incidents/index.tsx](../../src/pages/incidents/index.tsx) — hosts the `view` URL param and the segmented toggle in the page header; renders the list block or `<IncidentsTable>`. `IncidentsFilters`, `Pagination`, refresh / Create buttons wrap whichever view is active.
- [src/pages/incidents/TableView/IncidentsTable.tsx](../../src/pages/incidents/TableView/IncidentsTable.tsx) — builds the column config + edit/delete dialogs; renders `<DataTable>`.
- [src/pages/incidents/TableView/AsnChips.tsx](../../src/pages/incidents/TableView/AsnChips.tsx) — `Group.impactedAsns` as teal chips with `+N` overflow.
- [src/pages/incidents/TableView/statusFromGroup.ts](../../src/pages/incidents/TableView/statusFromGroup.ts) — derives `"Open" | "Closed" | "In Progress"`.

### Data → columns

Each row is a `Group` ([src/api/groups/types.ts](../../src/api/groups/types.ts)). React key `_id`.

| #   | Column         | bucket | Displayed value                                              | Source on `Group`                                        |
| --- | -------------- | ------ | ----------------------------------------------------------- | -------------------------------------------------------- |
| 1   | ID#            | —      | `#1234`                                                      | `idnum`                                                  |
| 2   | Incident Title | —      | Title link to `/incidents/:_id` + "N reports" subline       | `title`, `_reports.length`                              |
| 3   | Start Date     | md     | Date line 1, time line 2 (`YYYY-MM-DD` / `HH:MM` from ISO)  | `incidentStartedAt`                                     |
| 4   | Status         | —      | `Open` \| `Closed` \| `In Progress`                         | `statusFromGroup` (`closed` + `escalated`)              |
| 5   | Alerts Report  | xl     | Red bold count + "alerts" suffix when > 0; grey "0"          | `_reports.length`                                       |
| 6   | ASNs Impacted  | lg     | Up to 6 teal chips, then `+N` overflow chip                 | `impactedAsns`                                          |
| 7   | Assigned To    | xl     | Comma-joined usernames, or `—`                              | `assignedTo[].username`                                 |

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
- No bulk selection / no header checkbox — per-row only (no `selection` prop).

### View toggle

`view` is a URL param via `useQueryParams` (`?view=table` survives reload). The toggle is a small segmented control of two `AggieButton`s in the page header next to the refresh button.

---

## Alerts table

### Files

- [src/pages/Reports/TableView/ReportsTable.tsx](../../src/pages/Reports/TableView/ReportsTable.tsx) — assembles columns + selection + row actions + expand content, renders `<DataTable>`. `ReportRowActions` subcomponent owns its per-row "Add to Incident" modal.
- [src/pages/Reports/TableView/reportColumns.tsx](../../src/pages/Reports/TableView/reportColumns.tsx) — column defs + cell components (`PlatformCell`, `StatusCell`, `SignalCell`, `IncidentCell`) and helpers (`reportSource`, `reportSignal`).
- [src/pages/Reports/AllReportsList.tsx](../../src/pages/Reports/AllReportsList.tsx) — hosts the `view` URL param + segmented toggle; renders `<ReportsTable>` vs the list block. Strips `view` from the API query/key. Owns the list view's `expandedId` (single open at a time).
- [src/pages/Reports/index.tsx](../../src/pages/Reports/index.tsx) — wrapper is **full-width for both views** (the persistent right detail column is retired). A deep link to `/alerts/:id` (or `/mediaposts/:id`) still renders the standalone detail in a right slide-over drawer as a fallback.
- [src/pages/Reports/components/ReportsFilters.tsx](../../src/pages/Reports/components/ReportsFilters.tsx) — optional `viewToggle` prop next to the refresh button.
- [src/pages/Reports/Report/ReportDetail.tsx](../../src/pages/Reports/Report/ReportDetail.tsx) — **shared presentational detail** (action toolbar + `SocialMediaPost`, marks read on view). Used inline by both the list (`ReportListItem`) and table (expand panel), and by the standalone `/alerts/:id` route ([Report/index.tsx](../../src/pages/Reports/Report/index.tsx), now a thin fetch-by-id wrapper).
- [src/pages/Reports/components/ReportListItem.tsx](../../src/pages/Reports/components/ReportListItem.tsx) — optional `isExpanded`/`onToggleExpand` props add a "View details" toggle that renders `<ReportDetail>` inline (alerts/mediaposts list).

Table view is **alerts-only** — the same components serve `/mediaposts`, where the toggle is suppressed and the list always shows.

### Data → columns

Each row is a `Report` ([src/api/reports/types.ts](../../src/api/reports/types.ts)). React key `_id`.

| Column    | bucket | Displayed value                                                                                                       | Source on `Report`                            |
| --------- | ------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Select    | —      | checkbox (only in multi-select mode)                                                                                  | `useMultiSelect`                              |
| Platform  | —      | `SocialMediaIcon`                                                                                                     | `_media[0]`                                   |
| Content   | —      | `line-clamp-2` text (row click is **reserved for a future compare modal** — detail opens via the expand toggle)       | `content` via `formatText`                    |
| Status    | —      | Unread/Read + Ignore/Investigate token                                                                                | `read`, `irrelevant`                          |
| Date      | md     | `DateTime`                                                                                                            | `authoredAt`                                  |
| Source    | lg     | "IODA" / cloudflare `dataSource` / source nickname                                                                    | `reportSource` (mirrors `renderAuthor`)       |
| Incident  | lg     | linked incident chip `#idnum` or "—"                                                                                  | `_group` → `getGroup` (lazy `useQuery`)       |
| Signal    | xl     | datasource badge (BGP / Active Probing / Telescope)                                                                   | `metadata.rawAPIResponse.rawEvent.datasource` |

A trailing **Actions** column holds the icon actions (Read/Unread · Ignore · Investigate · Add to Incident — icon-only, `useReportMutations` + `AddReportsToIncident`). Below each row, a **full-width bar** holds the centered **More ▾** toggle, which expands the inline **full alert detail** (`ReportDetail`) + any hidden columns.

### Responsive collapse

Platform, Content, Status (and Select when active) are always visible; the action bar is always present. Hidden columns reappear inside the expanded panel.

| Width           | Columns added              |
| --------------- | -------------------------- |
| `< 768`         | Platform, Content, Status  |
| `≥ 768` (`md`)  | + Date                     |
| `≥ 1024` (`lg`) | + Source, Incident         |
| `≥ 1280` (`xl`) | + Signal                   |

### Clicking an alert → inline detail

Both the list and table reveal an alert's **full detail inline** rather than in a side panel:

- The detail body is the shared `ReportDetail` (action toolbar + `SocialMediaPost` event card), which also marks the report read when shown.
- **Table:** the centered **More ▾** toggle in the row's action bar expands it; `DataTable`'s `expandedContent` renders `<ReportDetail>` (plus auto-spillover for any hidden columns).
- **List:** `ReportListItem` shows a "View details" toggle that expands `<ReportDetail>` beneath the item; `AllReportsList` tracks a single `expandedId`.
- **Row click is intentionally left unwired** — reserved for a future **compare modal**. Detail opens only via the explicit expand toggle.

### Per-row & bulk actions

- Per-row (via `useReportMutations({ key: reportsQueryKey })`): Read/Unread (`setRead`), Ignore/Investigate (`setIrrelevance` toggling to `maybe`), Add to Incident (`AddReportsToIncident` modal, shown only when not already in an incident).
- Bulk: the existing `MultiSelectActions` toolbar in `AllReportsList` still drives multi-select; the table's leading checkbox column wires into the same `useMultiSelect`.

### Layout & view toggle

- `view` param resolved three-tier: URL (`?view=table`) → `localStorage["alerts:view"]` → default `list`. `view` is stripped from the report query (key + request) so toggling never refetches.
- Toggle: two `AggieButton`s (`faList`/`faTable`, `override`, `role="group"`), passed into `ReportsFilters` via `viewToggle`, beside the refresh button.
- Full-width: both views render `main` at full width — the permanent right detail column is retired in favor of inline expansion. A deep link to `/alerts/:id` still opens the standalone detail in a slide-over drawer (backdrop click → back to the base path, preserving filters).

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

---

## Open follow-ups

- Incidents: Status column header overlaps the title around ~600 px width — unresolved.
- Incidents: "N reports" subline text is very small; bump size.
- Populate real incident data end-to-end so the table isn't rendering against placeholder rows.

## Next iteration: compare modal

Row click is deliberately unwired in both alert views so it can drive a future **compare modal** (select/compare multiple alerts side-by-side). When building it: wire the row's click handler (table via `DataTable`'s `onRowClick`, list via the item wrapper) to open the comparison, keeping the expand toggle as the inline-detail affordance.
