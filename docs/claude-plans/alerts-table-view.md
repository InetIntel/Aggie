# Alerts Table View

A second view for the **Alerts** page, alongside the existing list view, built on a shared, config-driven `DataTable` extracted from the Incidents table. Same `Report` data, rendered as a density-tuned table with progressive column hiding as the viewport narrows.

This is a sister to [incidents-table-view.md](./incidents-table-view.md) — read that first for the original pattern. The key difference: Alerts render `Report` documents (media `ioda`/`cloudflare`), not incident `Group`s, so the table chrome is shared but the columns/actions are remapped.

## Shared component

- [src/components/DataTable/DataTable.tsx](../../src/components/DataTable/DataTable.tsx) — generic `DataTable<T>`: container, thead/tbody, optional leading select column, trailing **More Info** + **Actions** columns, expand-row state, empty/loading row. The Incidents table ([IncidentsTable.tsx](../../src/pages/incidents/TableView/IncidentsTable.tsx)) was refactored onto this too.
- [src/components/DataTable/types.ts](../../src/components/DataTable/types.ts) — `DataTableColumn<T>` + `DataTableProps<T>`.

A column declares a responsive `bucket` (`"md" | "lg" | "xl"`); the table derives **both** the hidden cell (`hidden {bucket}:table-cell`) and its "More Info" spillover block (`{bucket}:hidden`) from that single value, so they can never drift. `expandedContent(row)` renders page-specific detail below the auto-spillover.

## Files (Alerts)

- [src/pages/Reports/TableView/ReportsTable.tsx](../../src/pages/Reports/TableView/ReportsTable.tsx) — assembles columns + selection + row actions + expand content, renders `<DataTable>`. `ReportRowActions` subcomponent owns its per-row "Add to Incident" modal.
- [src/pages/Reports/TableView/reportColumns.tsx](../../src/pages/Reports/TableView/reportColumns.tsx) — column defs + cell components (`PlatformCell`, `StatusCell`, `SignalCell`, `IncidentCell`) and helpers (`reportSource`, `reportSignal`).
- [src/pages/Reports/AllReportsList.tsx](../../src/pages/Reports/AllReportsList.tsx) — hosts the `view` URL param + segmented toggle; renders `<ReportsTable>` vs the list block. Strips `view` from the API query/key.
- [src/pages/Reports/index.tsx](../../src/pages/Reports/index.tsx) — view-aware wrapper: full-width `main` when `view=table`; selected report shown in a right slide-over drawer.
- [src/pages/Reports/components/ReportsFilters.tsx](../../src/pages/Reports/components/ReportsFilters.tsx) — optional `viewToggle` prop next to the refresh button.

Table view is **alerts-only** — the same component also serves `/mediaposts`, where the toggle is suppressed and the list always shows.

## Data → columns

Each row is a `Report` from `GET /api/report` ([src/api/reports/types.ts](../../src/api/reports/types.ts)). React key `_id`.

| Column    | bucket | Displayed value                                                                                                                                                         | Source on `Report`                            |
| --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Select    | —      | checkbox (only in multi-select mode)                                                                                                                                    | `useMultiSelect`                              |
| Platform  | —      | `SocialMediaIcon`                                                                                                                                                       | `_media[0]`                                   |
| Content   | —      | `line-clamp-2` text (whole-row click → detail drawer)                                                                                                                   | `content` via `formatText`                    |
| Status    | —      | Unread/Read + Ignore/Investigate token                                                                                                                                  | `read`, `irrelevant`                          |
| Date      | md     | `DateTime`                                                                                                                                                              | `authoredAt`                                  |
| Source    | lg     | "IODA" / cloudflare `dataSource` / source nickname                                                                                                                      | `reportSource` (mirrors `renderAuthor`)       |
| Incident  | lg     | linked incident chip `#idnum` or "—"                                                                                                                                    | `_group` → `getGroup` (lazy `useQuery`)       |
| Signal    | xl     | datasource badge (BGP / Active Probing / Telescope)                                                                                                                     | `metadata.rawAPIResponse.rawEvent.datasource` |
| More Info | always | View/Hide → inline panel: full content, notes, tags, url + hidden columns. **Also hosts the action icons** (above the toggle) for alerts.                               | —                                             |
| Actions   | —      | Read/Unread · Ignore · Investigate · Add to Incident — icon-only, rendered inside the More Info cell (not a separate column) via `DataTable`'s `actionsInMoreInfo` prop | `useReportMutations` + `AddReportsToIncident` |

## Responsive collapse

Tailwind v3 breakpoints. Content, Status, More Info, Actions (and Select when active) are always visible. Hidden columns reappear inside the "More Info" panel.

| Width           | Columns added                                 |
| --------------- | --------------------------------------------- |
| `< 768`         | Platform, Content, Status, More Info, Actions |
| `≥ 768` (`md`)  | + Date                                        |
| `≥ 1024` (`lg`) | + Source, Incident                            |
| `≥ 1280` (`xl`) | + Signal                                      |

## Layout & view toggle

- `view` param resolved three-tier: URL (`?view=table`) → `localStorage["alerts:view"]` → default `list`. `view` is stripped from the report query (key + request) so toggling never refetches.
- Toggle: two `AggieButton`s (`faList`/`faTable`, `override`, `role="group"`), passed into `ReportsFilters` via `viewToggle`, beside the refresh button.
- Full-width: when `view=table`, `Reports/index.tsx` renders `main` at full width and drops the permanent aside; selecting a report opens the detail outlet in a fixed right slide-over drawer (backdrop click → back to `/alerts`, preserving filters).

## Per-row & bulk actions

- Per-row (via `useReportMutations({ key: reportsQueryKey })`): Read/Unread (`setRead`), Ignore/Investigate (`setIrrelevance` toggling to `maybe`), Add to Incident (`AddReportsToIncident` modal, shown only when not already in an incident).
- Bulk: the existing `MultiSelectActions` toolbar in `AllReportsList` still drives multi-select; the table's leading checkbox column wires into the same `useMultiSelect`.

## ⚠️ Known design debt — needs a future polish pass

**This view is functional but not visually finished.** It was iterated quickly to stop horizontal-overflow bugs, and several compromises were made to fit the columns + actions into the available width. It works, but it doesn't look great yet and should get a proper design pass before it's considered done. Specifics:

- **Actions live in the "More Info" column.** To stop the action buttons from pushing the table past the viewport, the four per-row actions were shrunk to icon-only and moved into the More Info cell (stacked above the View toggle) rather than a dedicated Actions column. It's compact but cramped and not obviously discoverable — actions rely on hover tooltips (`title`/`aria-label`) for their meaning. A cleaner pattern (e.g. a kebab/overflow menu, or a hover-reveal action bar like the list view's `ReportListItem`) would read better.
- **Icon row wraps under pressure.** The action icons are `flex flex-wrap`, so in a few narrow pixel bands right after a breakpoint reveals a new column, the last icon (usually "+Incident") drops to a second line instead of staying on one row. Acceptable as a no-scroll safety valve, but it looks slightly off at those widths.
- **Aggressive shrinking.** Several columns were made to shrink hard to fit: Content uses `break-words` (long tokens break mid-word), Source/Incident `truncate` with small `max-w`, and column width hints (`w-24`/`w-28`/`w-32`) were trimmed. Truncation + mid-word breaks are functional but visually rough; spacing and density deserve a deliberate redesign.
- **`overflow-x-auto` backstop.** The `DataTable` card has `overflow-x-auto` as a last-resort guard so the page never scrolls sideways. If overflow ever returns it'll scroll within the card — fine as a safety net, not as intended UX.
- **Responsive buckets are best-effort.** The breakpoints at which columns appear were tuned by hand to avoid overflow, not chosen for information priority. A design pass should reconsider which columns matter most and when they should appear.

When revisiting: consider whether the alert row is better served by a denser custom layout than a generic column table, and whether the actions belong in an overflow menu. The underlying `DataTable` is flexible enough to support either direction.

- **Add alert images.** Will need to tweak the rows to also include the image from the source when the user selects "more info"

## Future-tweak hooks

- Move a column between breakpoints: change its `bucket` once (cell + spillover follow).
- Reuse `DataTable` for the future social-posts table — pass a different column config.
- The detail drawer width is `max-w-xl`; bump if the report detail feels cramped.
- Actions placement is controlled by `DataTable`'s `actionsInMoreInfo` prop — drop it to restore a dedicated trailing Actions column if a redesign gives the row more room.
