# Alerts & Incidents tables

Two list surfaces — the **Reports/alerts** table (`src/pages/Reports/TableView/`)
and the **Incidents** table (`src/pages/incidents/TableView/`) — are built on one
generic, config-driven `DataTable`. This doc explains that shared component and how
each surface uses it.

## Shared component: `DataTable`

Files: `src/components/DataTable/DataTable.tsx` + `src/components/DataTable/types.ts`.

A caller passes `columns: DataTableColumn<T>[]` and `data: T[]`. Column shape
(`types.ts`):

- `id`, `header` (ReactNode; when a string it doubles as the spillover label),
  `cell: (row) => ReactNode`.
- `bucket?: "md" | "lg" | "xl" | "2xl"` — responsive breakpoint (see below).
- `thClassName` / `tdClassName` — width hints / alignment.
- `spilloverLabel?`, `noSpillover?` — control the "More Info" panel.

Other props: `getRowKey`, `rowActions`, `expandedContent`, `selection`,
`hideExpandBar`, `connectedExpanded`, `tableClassName`.

### Layout model (fixed layout — the table always fits the page)

The markup is:

```
<div class="border rounded-lg">        // no overflow handling
  <table class="w-full table-fixed ..."> // table-layout: fixed
```

- The table is `w-full` with **fixed** layout, so it is always exactly the width of
  its container (the host's `max-w-screen-2xl`) and **can never be wider**. Column
  widths come from the `w-*` hints on each `th`, *not* from content.
- **Every column must have an explicit width** (`w-*` or a `%`). Do NOT leave a
  column widthless (`auto`) as a "flex" column. Under fixed layout, the expanded
  detail row is a `colSpan`-all cell, and Chromium shrinks any *auto*-width column
  to its min-content whenever such a full-span cell is present — so a widthless
  column collapses (e.g. the incidents `title` stacked into a vertical single-letter
  column on expand). The fix is a **percentage** width on the flexible column
  (incidents `title` is `w-[30%]`): explicit, so the span can't collapse it, yet it
  scales with the table so the table still never overflows. (A fixed `rem` width
  would overflow on narrow screens; a `min-width` does *not* prevent the collapse.)
  Reports needs no such column — all its columns already have `w-*` widths.
- Because sizing ignores content, cells **clip** instead of forcing the table
  wider: data `<th>`s are `truncate` (nowrap + ellipsis) and data `<td>`s are
  `overflow-hidden` (wrapping cells still wrap; long nowrap values truncate). The
  **actions** cell is deliberately left unclipped so a row-action popout can escape
  it; its width is set per table via the `actionsColClassName` prop (fixed layout
  turns the old `w-px` shrink-to-content trick into a literal 1px, so the actions
  and caret columns need real widths).
- **There is deliberately still no `overflow-x` container** around the table — one
  isn't needed (the table can't overflow) and would re-base the sticky header to the
  wrapper (see "Sticky header"). So the table fits by **fixed layout + clipping**,
  and the bucket system additionally *hides* low-priority columns into "More Info"
  at smaller breakpoints.

(Historical note: before `table-fixed`, the table was auto-layout with
`whitespace-nowrap` headers and no guard, so a column-heavy table spilled off the
right edge of the page. That was the "overflow bug" — now fixed structurally.)

### Responsive buckets + the "More Info" spillover

- `HIDDEN_CELL[bucket]` = `hidden {bp}:table-cell`. A column with a bucket is hidden
  below its breakpoint and shown at/above it. A column with **no** bucket always
  shows.
- When a row is expanded, `spilloverColumns()` (columns that have a bucket and are
  not `noSpillover`) render in a `<dl>` inside the detail cell under
  `SPILLOVER_BLOCK[bucket]` = `{bp}:hidden` — i.e. each hidden column reappears as a
  "Label: value" line **only while it is hidden from the row**. At the widest
  breakpoint (nothing hidden) the whole spillover list collapses away.

So the intended way to fit more columns on smaller screens is: give lower-priority
columns a higher bucket so they drop out of the row and fall into "More Info".

### Sticky header (why there's no scroll wrapper)

`STICKY_TH` makes each `<th>` `position: sticky` with `top: var(--dt-sticky-top,
0px)`. The header pins to the **page** scroller (`#main_view`), and the host page
publishes its own sticky-chrome height into `--dt-sticky-top` (e.g. the incidents
page measures its filters bar with `useMeasuredHeight` and sets the var so the table
header parks just beneath it).

Because sticky positioning re-bases to the nearest scrolling ancestor, wrapping the
table in an `overflow-x-auto` (or any `overflow != visible`) container would make the
header stick to that wrapper instead of the page — breaking the pinned header. The
tables were deliberately reworked to **flow with the page instead of an inner scroll
box** (commit `ab168e49`), which is why no scroll wrapper exists.

Note: the **expanded detail** `<td>` *does* set `overflow-x-auto` — only the detail
content can scroll horizontally, not the column grid.

### Expanded rows

`expandedContent(row)` is rendered **only when the row is expanded**
(`{isExpanded && hasExpandable && (…)}`), so a `useQuery` mounted inside it fetches
lazily per row. Options: `hideExpandBar` (far-right caret instead of a centered
"View details" bar) and `connectedExpanded` (row + detail share one card/accent).

## Reports (alerts) table

- Columns: `src/pages/Reports/TableView/reportColumns.tsx` (`buildReportColumns()`),
  consumed by `ReportsTable.tsx`. Row type `Report`.
- The **ASN / Network / Geo Scope** column was added by **repurposing the existing,
  redundant "Source" column** (net-zero column count). Values are derived per report
  by `reportNetwork()` in `src/components/SocialMediaPost/reportParser.ts` from
  `report.asn` + `report.metadata.rawAPIResponse.entityName/entityScope`. A single
  report has one ASN / one scope, so the cell is a short stacked ASN / network /
  scope; `bucket: "lg"`, `w-36`.

## Incidents table

- `src/pages/incidents/TableView/IncidentsTable.tsx`. Row type is **`Group`**
  ("incident" is just the UI label). Columns: `idnum`, `title` (`w-[30%]`, the
  flexible column — see the Layout model on why it's a percentage), `date` (`md`),
  `status`, `asn` (`lg`), `dpc` (2xl), `ipc` (2xl), `alertsReport` (xl), `assignedTo`
  (xl). This is a **column-dense** table — several fixed-width columns show at once at
  wide breakpoints, which is what makes the fixed-layout fit discipline matter here.
- ASN data lives **directly on the Group**: `impactedAsns?: string[]` and
  `impactedGeoScopes?: string[]` (`src/api/groups/types.ts`), also editable via
  `GroupEditableData`. Per-ASN metadata (org name, coverage) is *not* on the Group —
  it is fetched via `getAsnsByIds` (POST `/api/asn/bulk`, `src/api/asn/`).
- **ASN / Geo Scope column** (`id: "asn"`, after `status`, `bucket: "lg"`) — the
  incidents-table counterpart to the Reports ASN column. Renders `AsnChips` over
  `Group.impactedAsns` plus a compact muted line of `Group.impactedGeoScopes` joined
  by `·`. Both fields live directly on the incident, so it works on every row with no
  fetch. `bucket: "lg"` hides it below the `lg` breakpoint, where it reappears in the
  row's "More Info" spillover.
- `AsnChips` (`.../TableView/AsnChips.tsx`) renders a wrapped, width-bounded row of
  teal ASN chips with a `+N` overflow (`—` when empty) — purpose-built for the
  multi-ASN incident case (an incident spans many ASNs, unlike a single report).
- **Expanded row** shows incident metadata + `ImpactedAsnTable` (a sortable table
  that fetches ASN org/coverage), and below them the incident's **alerts list** via
  the local `IncidentAlertsList` component. `IncidentAlertsList` calls
  `getGroupReports({ groupId })` and renders each report with `GroupReportListItem` →
  `SocialMediaListItem` — the same rendering (and same `["groups","reports",
  {groupId}]` query key, so the same cache) as the incident **detail page**
  (`src/pages/incidents/Incident/index.tsx`). Because `expandedContent` only mounts
  when a row is expanded, the fetch fires **lazily per incident** on expand (no
  fan-out). It's read-only here (select-mode props stubbed); report management stays
  on the detail page.
- Incidents page shell: `src/pages/incidents/index.tsx` — list/table toggle
  (`?view=`), `getGroups`, `groups:update` socket refetch, compare mode.
