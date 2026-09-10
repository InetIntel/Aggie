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
- `minWidth?: number` — the column's min/target width in px (applied as the `<th>`
  width basis; see below).
- `collapsePriority?: number` — **higher = more persistent** (dropped later). Columns
  with a priority collapse into "More Info" as the table narrows, in descending
  priority order. Omit for an always-visible column. See below.
- `grow?: boolean` — mark the one column that absorbs leftover width so the row fills
  the table exactly (others stay at `minWidth`). One per table.
- `thClassName` / `tdClassName` — alignment / content hints (no longer width).
- `spilloverLabel?`, `noSpillover?` — control the "More Info" panel.

Other props: `getRowKey`, `rowActions`, `actionsColWidth` (px width of the pinned
actions/caret column), `expandedContent`, `selection`, `hideExpandBar`,
`connectedExpanded`, `tableClassName`.

### Layout model (fixed layout — the table always fits the page)

The markup is:

```
<div class="border rounded-lg">        // no overflow handling
  <table class="w-full table-fixed ..."> // table-layout: fixed
```

- The table is `w-full` with **fixed** layout, so it is always exactly the width of
  its container (the host's `max-w-screen-2xl`) and **can never be wider**. Column
  widths are **computed in JS** from the measured width (see "Measured collapse") and
  applied inline as the `<th>` `width` (never a CSS `min-width`) — _not_ derived from
  content. The visible columns sit at their `minWidth`, the `grow` column absorbs the
  leftover so they fill the table exactly, and on a too-narrow container every width is
  scaled down so the table still never overflows.
- **Every column must have an explicit width** (`minWidth`). Do NOT leave a column
  widthless (`auto`). Under fixed layout, the expanded detail row is a `colSpan`-all
  cell, and Chromium shrinks any _auto_-width column to its min-content whenever such
  a full-span cell is present — so a widthless column collapses (e.g. the incidents
  `title` once stacked into a vertical single-letter column on expand). An explicit
  px `width` (from `minWidth`) can't be collapsed by the span, yet still scales with
  the table so it never overflows.
- Because sizing ignores content, cells **clip** instead of forcing the table
  wider: data `<th>`s are `truncate` (nowrap + ellipsis) and data `<td>`s are
  `overflow-hidden` (wrapping cells still wrap; long nowrap values truncate). The
  **actions** cell is deliberately left unclipped so a row-action popout can escape
  it; its width is set per table via the `actionsColWidth` prop (px), sized to fit the
  buttons plus the caret and reserved by the fit calculation. The expand **caret** now
  shares this one trailing column with the row actions rather than getting its own
  (see below).
- **There is deliberately still no `overflow-x` container** around the table — one
  isn't needed (the table can't overflow) and would re-base the sticky header to the
  wrapper (see "Sticky header"). So the table fits by **fixed layout + clipping**,
  and the measured-collapse system additionally _hides_ low-priority columns into
  "More Info" as the table narrows.

(Historical note: before `table-fixed`, the table was auto-layout with
`whitespace-nowrap` headers and no guard, so a column-heavy table spilled off the
right edge of the page. That was the "overflow bug" — now fixed structurally.)

### Measured collapse + the "More Info" spillover

Collapse is driven by **measuring the table's own width** with a `ResizeObserver`
(`src/hooks/useMeasuredWidth.ts`, a width sibling of `useMeasuredHeight`), so it tracks
the table's real width even when a sidebar narrows it — not the viewport.

> **Why not CSS container queries?** That was the first implementation (a
> `@container/dt` wrapper + a `@[Npx]/dt:…` ladder). It could not account for the
> **select checkbox column**, which appears only in compare/select mode: the collapse
> thresholds are static CSS, so in select mode the extra column pushed the row past the
> container and — because fixed layout *grows* rather than shrinks when specified
> widths exceed the container — the actions group spilled off the right edge. Measuring
> in JS lets the fit math see the select column (and the exact actions width), so it
> can never under-budget.

`computeFit()` in `DataTable.tsx`, given the measured width:

- Reserves the select column (when shown) and the actions column, then walks the
  `collapsePriority` columns **most-persistent-first**, keeping each while its
  `minWidth` still fits the running total; the rest are hidden. Columns with no
  `collapsePriority` always show.
- Hidden columns get the `hidden` (display:none) class on their `<th>`/`<td>`, so they
  drop out of layout entirely (no width, no overflow).
- It returns an explicit px width for every visible column: columns sit at their
  `minWidth` and the `grow` column (incidents `title`, alerts `source`) absorbs the
  leftover so the widths sum to exactly the available width. Computing the widths
  (rather than leaving it to the browser) is what makes the columns fill reliably in
  both collapsed and expanded states — a full-width `colSpan` detail row otherwise
  disrupts how fixed layout distributes slack.
- The fit is computed against the measured width minus a small `FIT_SAFETY` margin
  (6px), so borders and sub-pixel rounding can never tip the last column (the
  actions/caret group) past the container's right edge.
- If even the always-on columns + reserved don't fit (a narrow phone), every width —
  data, select, and actions — is scaled down by one factor so the table shrinks to fit
  instead of growing past the container.
- When a row is expanded, exactly the currently-hidden, non-`noSpillover` columns
  render as "Label: value" lines in a `<dl>` in the detail cell. When the table is wide
  enough to show everything, that list is empty.

So the collapse **order** is encoded independently of display order by
`collapsePriority` (higher = kept longer); the collapse **thresholds** are computed
from the real widths, so there are no hand-tuned magic numbers.

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

Note: the **expanded detail** `<td>` _does_ set `overflow-x-auto` — only the detail
content can scroll horizontally, not the column grid.

The collapse system only *reads* the wrapper's width (`ResizeObserver`) — it adds no
`overflow` and no CSS containment — so the sticky header is unaffected.

### Expanded rows

`expandedContent(row)` is rendered **only when the row is expanded**
(`{isExpanded && hasExpandable && (…)}`), so a `useQuery` mounted inside it fetches
lazily per row. Options: `hideExpandBar` (caret instead of a centered "View details"
bar) and `connectedExpanded` (row + detail share one card/accent).

The expanded detail cell (and the empty-state cell) uses `colSpan={totalCols}`, and
`totalCols` counts only the **currently visible** columns (`columns.length −
hiddenIds.size`), _not_ the collapsed ones. Hidden columns are `display:none`, so
counting them would make the browser pad phantom empty columns onto the right of an
expanded row — the "gap on the right when a row is open" bug.

### Trailing actions/caret column

The row actions (`rowActions`) and — when `hideExpandBar` is set — the expand caret
render together in a **single pinned trailing column**, not two separate columns. It
never collapses; its width is `actionsColWidth` px (alerts 216, incidents 176 — ≥ the
175px minimum), reserved by the fit calculation.

The group is a **block `flex justify-end`** (not `inline-flex`): it fills the cell and
right-aligns, so if the buttons are ever wider than the column they overflow **left**
(into the neighbor column, which clips) and the caret stays pinned at the cell's right
edge. An `inline-flex` here spilled the group to the **right**, pushing the caret past
the table's right border. The cell itself is left unclipped so a row-action popout can
still escape it.

## Reports (alerts) table

- Columns: `src/pages/Reports/TableView/reportColumns.tsx` (`buildReportColumns()`),
  consumed by `ReportsTable.tsx`. Row type `Report`.
- The **ASN / Network / Geo Scope** column was added by **repurposing the existing,
  redundant "Source" column** (net-zero column count). Values are derived per report
  by `reportNetwork()` in `src/components/SocialMediaPost/reportParser.ts` from
  `report.asn` + `report.metadata.rawAPIResponse.entityName/entityScope`. A single
  report has one ASN / one scope, so the cell is a short stacked ASN / network /
  scope; `minWidth: 200`, `collapsePriority: 4`.
- Columns (display order, `minWidth` / `collapsePriority`): `platform` (140, always
  on), `status` (140 / 2), `date` (200 / 5), `source`/ASN (200 / 4, the `grow` column),
  `incident` (200 / 3), `signal` (200 / 1). Collapse order as the table narrows: signal
  → status → Incident → ASN → date; platform always stays.
- The **Signal** tag (`SignalCell`) is `whitespace-nowrap` so a label like "Active
  Probing" stays on one line rather than wrapping; the signal column is sized wide
  enough (200) to hold it.

## Incidents table

- `src/pages/incidents/TableView/IncidentsTable.tsx`. Row type is **`Group`**
  ("incident" is just the UI label). Columns (display order, `minWidth` /
  `collapsePriority`): `idnum` (100, always on), `title` (300 / 8, the flex column —
  largest width, absorbs slack), `date` (220 / 7), `status` (240 / 6), `asn` (160 / 5),
  `dpc` (100 / 4), `ipc` (100 / 3), `alertsReport` (100 / 2), `assignedTo`
  (140 / 1). Collapse order as the table narrows: assignedTo → alertsReport → ipc →
  dpc → asn → status → date → title; idnum always stays. This is a **column-dense**
  table — several columns show at once when wide, which is what makes the fit
  discipline matter here.
- ASN data lives **directly on the Group**: `impactedAsns?: string[]` and
  `impactedGeoScopes?: string[]` (`src/api/groups/types.ts`), also editable via
  `GroupEditableData`. Per-ASN metadata (org name, coverage) is _not_ on the Group —
  it is fetched via `getAsnsByIds` (POST `/api/asn/bulk`, `src/api/asn/`).
- **ASN / Geo Scope column** (`id: "asn"`, after `status`, `collapsePriority: 5`) — the
  incidents-table counterpart to the Reports ASN column. Renders `AsnChips` over
  `Group.impactedAsns` plus a compact muted line of `Group.impactedGeoScopes` joined
  by `·`. Both fields live directly on the incident, so it works on every row with no
  fetch. **Left as-is pending a separate rework of ASN handling** — its `minWidth` /
  `collapsePriority` are provisional.
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

## Status: done

- [x] Both tables are responsive to the **table's own width** — a `ResizeObserver`
  measures the wrapper and `computeFit()` drops columns into "More Info" instead of
  ever scrolling horizontally (see "Measured collapse").
- [x] Each column has a `minWidth` (applied as its width basis).
- [x] Column display order + collapse order + min-widths per the spec below.
- [x] Actions + caret merged into one pinned trailing column.

Two deviations from the literal spec, agreed with the maintainer:
- **"Other button group" stays pinned** (always visible), so it does not appear in the
  collapse order — its listed collapse position is treated as "never collapses".
- **Incidents ASN / Geo Scope column** is kept as-is (provisional `minWidth` /
  `collapsePriority`) pending a separate rework; the spec's incidents column list omits
  it.

(Implementation note: the first cut used CSS container queries; it was replaced with
the measured approach because pure-CSS thresholds could not budget the dynamic select
column — see "Measured collapse".)

The original spec is preserved below for reference.

## Spec (implemented)

- tables should never require horizontal scrolling, the columns should collapse into "more info"
- each column will have a set minimum width

### alerts table

- order of columns:
  1. platform
  2. status
  3. date
  4. ASN / Network / Geo Scope
  5. Incident
  6. signal
  7. Other button group

- order of columns that collapse. from 1 being the last thing to collapse to z being the first thing to collapse as the table width gets smaller:
  1. platform
  2. date
  3. ASN / Network / Geo Scope
  4. Other button group
  5. Incident
  6. status
  7. signal

- ensure it includes:
  1. platform with a minimum column width of 140 px
  2. status with a minimum column width of 140 px
  3. date with a minimum column width of 200 px
  4. ASN / Network / Geo Scope with a minimum column width of 200 px
  5. Incident with a minimum column width of 200 px
  6. signal with a minimum column width of 175 px
  7. Other button group with a minimum column width of 175 px

- other fixes:
  - the grouping of other buttons on the right side of the table should all be one group. right now the carrot is in it's own column and that can just be combined

### incidents table

- order of columns
  1. ID #
  2. Incident title
  3. date
  4. status
  5. DPC
  6. IPC
  7. number of alerts
  8. Assigned to
  9. Other button group

- order of columns that collapse. from 1 being the last thing to collapse to z being the first thing to collapse as the table width gets smaller:
  1. ID #
  2. Incident title
  3. Other button group
  4. date
  5. status
  6. DPC
  7. IPC
  8. number of alerts
  9. Assigned to

- ensure it includes:
  1. ID # with a minimum column width of 100 px
  2. Incident title with a minimum column width of 300 px
  3. date with a minimum column width of 220 px
  4. status with a minimum column width of 240 px
  5. DPC with a minimum column width of 100 px
  6. IPC with a minimum column width of 100 px
  7. number of alerts minimum column width of 100 px
  8. Assigned to minimum column width of 140 px
  9. Other button group with a minimum column width of 175 px

- other fixes:
  - the grouping of other buttons on the right side of the table should all be one group. right now the carrot is in it's own column and that can just be combined
