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
- `collapseStep?: CollapseStep` — the **container width** (px) below which the column
  collapses into "More Info" (see below). Omit for an always-visible column.
- `thClassName` / `tdClassName` — alignment / content hints (no longer width).
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
  widths come from each column's `minWidth` (applied inline as the `<th>` `width`
  basis), _not_ from content. Under `w-full` fixed layout the browser scales those
  bases up to fill the container, so `minWidth` behaves as a floor — a column shown
  at all renders at/above its `minWidth` (the collapse thresholds guarantee it only
  appears when there is room; see below). The widest column (incidents `title`,
  `minWidth: 300`) absorbs the most slack and effectively acts as the flex column.
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
  it; its width is set per table via the `actionsColClassName` prop (fixed layout
  turns the old `w-px` shrink-to-content trick into a literal 1px, so it needs a real
  width — both tables use `w-44`). The expand **caret** now shares this one trailing
  column with the row actions rather than getting its own (see below).
- **There is deliberately still no `overflow-x` container** around the table — one
  isn't needed (the table can't overflow) and would re-base the sticky header to the
  wrapper (see "Sticky header"). So the table fits by **fixed layout + clipping**,
  and the container-query collapse system additionally _hides_ low-priority columns
  into "More Info" as the table narrows.

(Historical note: before `table-fixed`, the table was auto-layout with
`whitespace-nowrap` headers and no guard, so a column-heavy table spilled off the
right edge of the page. That was the "overflow bug" — now fixed structurally.)

### Container-query collapse + the "More Info" spillover

Collapse is driven by **CSS container queries** against the table's own width, not
the viewport — the wrapper `<div>` is a named container (`@container/dt`, i.e.
`container-type: inline-size`), so a table narrowed by a sidebar collapses correctly
even when the window is wide. (This needs the `@tailwindcss/container-queries` plugin,
registered in `tailwind.config.js`.)

- `HIDDEN_CELL[step]` = `hidden @[{px}px]/dt:table-cell` and `SPILLOVER_BLOCK[step]` =
  `@[{px}px]/dt:hidden`. A column with `collapseStep: N` is hidden in the row while
  the container is narrower than `N` px and shown at/above it; a column with **no**
  `collapseStep` always shows. One value drives both maps so cell and spillover can't
  disagree.
- **JIT gotcha:** Tailwind only generates classes it sees as **literal strings**, so
  the full step ladder is spelled out literally in `DataTable.tsx` (a computed
  `@[${n}px]/dt:…` would emit no CSS). Callers pick a `collapseStep` from that ladder.
- Thresholds are chosen by **cumulative min-width**: a column's step ≈ the sum of the
  min-widths of everything shown at/above it (the always-visible columns + the pinned
  actions column + higher-priority columns + itself), rounded up to the nearest ladder
  step. So a column only reappears once there is genuinely room for it at its
  `minWidth`, which is why visible columns always meet their floor.
- When a row is expanded, `spilloverColumns()` (columns that have a `collapseStep` and
  are not `noSpillover`) render in a `<dl>` inside the detail cell under
  `SPILLOVER_BLOCK[step]` — each hidden column reappears as a "Label: value" line
  **only while it is hidden from the row**. Once the container is wide enough that
  nothing is hidden, the whole spillover list collapses away.

So the collapse **order** is encoded independently of display order by the
`collapseStep` values: lower-priority columns get a higher step so they drop into
"More Info" first as the table narrows.

(If container queries ever prove insufficient — JIT limits, threshold granularity, a
containment edge case — the documented fallback is to drive the same hide/show
decision from JS by measuring the wrapper width with a `ResizeObserver` sibling of
`src/hooks/useMeasuredHeight.ts`; the column metadata stays identical.)

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

The wrapper's `@container/dt` (`container-type: inline-size`, added for the collapse
system) is **not** a scroll container, so it should not re-base the sticky header
(only `overflow != visible` would) — worth a quick in-app confirm when changing it.

### Expanded rows

`expandedContent(row)` is rendered **only when the row is expanded**
(`{isExpanded && hasExpandable && (…)}`), so a `useQuery` mounted inside it fetches
lazily per row. Options: `hideExpandBar` (caret instead of a centered "View details"
bar) and `connectedExpanded` (row + detail share one card/accent).

### Trailing actions/caret column

The row actions (`rowActions`) and — when `hideExpandBar` is set — the expand caret
render together in a **single pinned trailing column** (`inline-flex` group), not two
separate columns. It never collapses; its width is `actionsColClassName` (`w-44` on
both tables, ≥ the 175px minimum).

## Reports (alerts) table

- Columns: `src/pages/Reports/TableView/reportColumns.tsx` (`buildReportColumns()`),
  consumed by `ReportsTable.tsx`. Row type `Report`.
- The **ASN / Network / Geo Scope** column was added by **repurposing the existing,
  redundant "Source" column** (net-zero column count). Values are derived per report
  by `reportNetwork()` in `src/components/SocialMediaPost/reportParser.ts` from
  `report.asn` + `report.metadata.rawAPIResponse.entityName/entityScope`. A single
  report has one ASN / one scope, so the cell is a short stacked ASN / network /
  scope; `minWidth: 200`, `collapseStep: 720`.
- Columns (display order): `platform` (min 140, always on), `status` (140), `date`
  (200), `source`/ASN (200), `incident` (200), `signal` (175). Collapse order as the
  table narrows: signal → status → Incident → ASN → date; platform always stays.

## Incidents table

- `src/pages/incidents/TableView/IncidentsTable.tsx`. Row type is **`Group`**
  ("incident" is just the UI label). Columns (display order, `minWidth` /
  `collapseStep`): `idnum` (100, always on), `title` (300, the flex column — largest
  width, absorbs slack), `date` (220 / 800), `status` (240 / 1040), `asn` (160 / 1200),
  `dpc` (100 / 1360), `ipc` (100 / 1440), `alertsReport` (100 / 1520), `assignedTo`
  (140 / 1680). Collapse order as the table narrows: assignedTo → alertsReport → ipc →
  dpc → asn → status → date → title; idnum always stays. This is a **column-dense**
  table — several columns show at once when wide, which is what makes the fit
  discipline matter here.
- ASN data lives **directly on the Group**: `impactedAsns?: string[]` and
  `impactedGeoScopes?: string[]` (`src/api/groups/types.ts`), also editable via
  `GroupEditableData`. Per-ASN metadata (org name, coverage) is _not_ on the Group —
  it is fetched via `getAsnsByIds` (POST `/api/asn/bulk`, `src/api/asn/`).
- **ASN / Geo Scope column** (`id: "asn"`, after `status`, `collapseStep: 1200`) — the
  incidents-table counterpart to the Reports ASN column. Renders `AsnChips` over
  `Group.impactedAsns` plus a compact muted line of `Group.impactedGeoScopes` joined
  by `·`. Both fields live directly on the incident, so it works on every row with no
  fetch. It collapses into "More Info" below a 1200px container. **Left as-is pending
  a separate rework of ASN handling** — its `minWidth`/`collapseStep` are provisional.
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

- [x] Both tables are responsive to the **table's own width** via CSS container
  queries (`@container/dt` + per-column `collapseStep`); columns collapse into "More
  Info" instead of ever scrolling horizontally.
- [x] Each column has a `minWidth` (applied as its width basis / floor).
- [x] Column display order + collapse order + min-widths per the spec below.
- [x] Actions + caret merged into one pinned trailing column.

Two deviations from the literal spec, agreed with the maintainer:
- **"Other button group" stays pinned** (always visible), so it does not appear in the
  collapse order — its listed collapse position is treated as "never collapses".
- **Incidents ASN / Geo Scope column** is kept as-is (provisional `minWidth`/step)
  pending a separate rework; the spec's incidents column list omits it.

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
