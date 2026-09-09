# Incidents table: ASN column, alerts list, and the overflow fix

See `docs/claude/architecture/alerts-incidents-tables.md` for how the shared
DataTable and these tables work; this plan assumes that context.

## Why

The Reports/alerts table view gained an "ASN / Network / Geo Scope" column
(commit `0a441f53`), but the Incidents table view was never given the equivalent.
On the incidents table, ASN data only appeared inside the expanded row (via
`ImpactedAsnTable`) and the incident's actual alerts weren't shown there at all.

This work brings the incidents table to parity:

1. An at-a-glance **ASN / Geo Scope** column on every row.
2. The incident's **alerts list** inside the expanded row, rendered exactly like
   the incident detail page.

Pure-frontend; no backend/API changes — all data already ships on existing rows
and endpoints. Adding the column, however, surfaced a layout bug (the table runs
off the right edge of the page); that fix is tracked in the last section.

## What changed

All in `src/pages/incidents/TableView/IncidentsTable.tsx`.

### ASN / Geo Scope column

- Wired up the previously **orphaned** `src/pages/incidents/TableView/AsnChips.tsx`
  (teal ASN chips with `+N` overflow, `—` when empty).
- New `DataTableColumn<Group>` with `id: "asn"`, placed after `status`. Renders
  `AsnChips` over `Group.impactedAsns` plus a compact muted line of
  `Group.impactedGeoScopes` joined by `·`. `bucket: "lg"` so it hides below the
  `lg` breakpoint and spills into the row's "More Info" panel.
- Both `impactedAsns` and `impactedGeoScopes` are stored directly on the incident,
  so the column works on all existing rows with no fetch.

### Alerts list in the expanded row

- New local `IncidentAlertsList` component fetches `getGroupReports({ groupId })`
  and renders each report with `GroupReportListItem` → `SocialMediaListItem` — the
  same rendering the incident detail page uses. Query key `["groups","reports",
  {groupId}]` matches the detail page, so the cache is shared.
- Mounted inside `DataTable`'s `expandedContent`, which only renders when a row is
  expanded, so the fetch fires **lazily per incident** on expand (no fan-out).
- Read-only here (select-mode props stubbed); report management stays on the
  detail page. Added below the existing metadata + Impacted ASN two-column block.

### Verify (ASN column + alerts list)

1. `npm run dev`, open **Incidents → Table** (`?view=table`).
2. ASN column shows chips + geo line for incidents with ASNs, `—` otherwise;
   hides below `lg` and appears in "More Info".
3. Expand a row → metadata + Impacted ASN table still render, and an "Alerts (N)"
   list appears below. Network tab: `GET /api/report?...groupId=...` fires only on
   expand, once per opened row.
4. 0-report incident → "No alerts."; collapse/re-expand → no refetch.
5. Light/dark both fine. List view + detail page unchanged.

---

## Follow-up fix: table overflows off the right side of the page

### Problem

After adding the ASN column, the Incidents table runs past the right edge of the
page at wide viewports.

### Root cause

Per the architecture doc: `DataTable` renders a `w-full`, auto-layout table with
`whitespace-nowrap` headers and **no `overflow-x` container**. It keeps within the
page by *hiding* columns into the "More Info" spillover at smaller breakpoints, not
by scrolling. The Reports table added its ASN column by **repurposing** a redundant
column (net-zero width). The Incidents table instead gained a **net-new** column on
an already column-dense row, so at wide breakpoints the summed column widths exceed
the `max-w-screen-2xl` page container and spill off-page.

### What was tried

1. Added the ASN column (`w-40`, `bucket: "lg"`) plus a geo-scope line, and wired an
   alerts list into the expanded row. → introduced the overflow.
2. Changed the geo-scope line from `truncate` (nowrap, which forced the column wide
   on multi-scope incidents) to `break-words` within a bounded `max-w`. → trimmed
   that one column but did **not** fix the overflow, because the net extra column
   still pushes the total past the container.
3. Tried to reproduce/measure in a headless browser against the running dev app to
   get exact per-column widths; blocked by login (dev admin password unknown) and an
   over-eager attempt to create a temp DB user was correctly stopped. **No DB or
   config changes were made.** Exact pixel measurements are still not captured.

### Options

- **A. Horizontal-scroll wrapper** — wrap the incidents table in `overflow-x-auto`.
  Robust for any content width. **Tradeoff:** an overflow ancestor re-bases the
  sticky header to the wrapper, breaking the page-pinned header the design relies on
  (architecture doc → "Sticky header"). Would need to either accept that or
  re-engineer the sticky behavior.
- **B. Keep it within the container (true to the design)** — make the new ASN column
  participate in the bucket system so total width fits:
  - narrow the column (chips already wrap/bound themselves), and/or
  - give it a higher `bucket` (e.g. `xl`/`2xl`) so it only shows where there is
    slack and otherwise appears in "More Info";
  - optionally mirror the Reports approach and **repurpose/merge** an existing
    low-value column instead of adding one (net-zero width).

### Resolution (implemented)

Neither A nor per-column bucket tuning — the real problem was that `DataTable` had
**no overflow guard at all**, so it recurred on every table. Fixed at the shared
component level: the table is now **`table-layout: fixed`** (`table-fixed` on the
`<table>` in `src/components/DataTable/DataTable.tsx`), so it is always exactly the
container width and structurally cannot exceed it — column widths come from the
`w-*` header hints (scaled to fit) instead of content. This keeps the page-pinned
sticky header exactly as-is (no `overflow-x` ancestor is introduced).

Supporting changes in `DataTable.tsx`:

- Data-column `<th>` clips (`overflow-hidden text-ellipsis`) and data-column `<td>`
  clips (`overflow-hidden`, no forced nowrap) so long content truncates within its
  column instead of spilling past the table edge.
- The `w-px` **actions** and **caret** columns (an auto-layout shrink-to-content
  trick that collapses to a literal 1px under fixed layout) now get real widths: the
  caret is `w-10`, and the actions column width is a new optional
  `actionsColClassName` prop (default `w-16`) so each table sizes it to its buttons —
  Incidents passes `w-24` (3 icons), Reports passes `w-28 xl:w-40` (up to 4 bordered
  buttons). Actions cells are intentionally left unclipped so a row-action popout can
  still escape the cell.

Result: both the Incidents and Reports tables now always fit the page; the
incidents ASN column keeps `bucket: "lg"` for the "More Info" spillover at narrow
widths.

### Verify (overflow fix)

1. `npm run dev`, open Incidents → Table (`?view=table`).
2. Resize across 1280 / 1440 / 1512 / 1536 / 1920: **no page-level horizontal
   scrollbar** at any width, and the sticky header still pins beneath the filters bar
   on vertical scroll.
3. ASN chips + geo scope show in the row where intended, and drop into "More Info"
   (expanded row) at narrower widths.
4. Reports table (also a `DataTable` consumer) now shares the fix — verify it too
   fits at every width, action buttons render full-size (not clipped to 1px), and
   any row-action popout still escapes its cell.
