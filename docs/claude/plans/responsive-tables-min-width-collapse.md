# Plan: Make the Alerts & Incidents tables mobile-responsive (min-width + priority collapse)

## Context

The Reports/alerts table and the Incidents table share one `DataTable`
(`src/components/DataTable/`). Today it collapses columns at **4 fixed viewport
breakpoints** (`bucket: md|lg|xl|2xl`) using CSS `hidden {bp}:table-cell`, keyed off
**window** width. It has **no per-column pixel min-width** and no collapse order
distinct from display order. The table never overflows only because it is
`table-fixed w-full` and clips content.

The todo in `docs/claude/architecture/alerts-incidents-tables.md` requires:
- Both tables mobile-responsive; **never** horizontal-scroll — columns collapse into
  the "More Info" panel instead.
- **Each column has a pixel minimum width.**
- A **collapse priority order** with 6 (alerts) / up to 9 (incidents) distinct
  levels — more granular than 4 breakpoints, and (for alerts) different from display
  order.
- The right-side action buttons + the expand caret should be **one combined group**
  (currently the caret is its own separate column).

## Decisions locked with the user
- **Mechanism: start with B (CSS container queries); fall back to C (JS
  ResizeObserver) if B doesn't work out.** The two differ only in *how* the
  hide/show decision is made — the column metadata (min-widths, collapse order) and
  the merged action/caret column are identical for both, so a fallback is cheap.
- **Button group stays pinned** — never collapses into "More Info"; always visible on
  the right. Its entry in the collapse lists is treated as pinned.
- **Incidents ASN / Geo Scope column: leave as-is for now** (user will restructure it
  separately). Keep it present; give it a min-width + a provisional collapse slot;
  don't remove it or renumber the spec around it.

## Why B, and why sticky is a non-issue
- Sticky header works today and stays working — `position: sticky` on each `<th>`,
  re-based to the page scroller because there's deliberately no `overflow-x` wrapper.
  Neither B nor C adds an `overflow` wrapper, so the header is untouched. (B adds a
  `container-type` context, which is *not* a scroll container; verify in-app as a
  precaution, but it is expected to be fine.)
- Container queries react to the **table's own width** (not the window), which is what
  "never overflow *this table*" actually needs, and allow arbitrary thresholds for a
  6–9 level order. Cost: a new Tailwind plugin + hand-chosen thresholds.

## Structural guarantee (unchanged for A/B/C)
The table stays `table-fixed w-full`, so it can **never overflow** its container.
Columns keep explicit `w-*` width hints; the collapse mechanism only *hides/shows*
columns. A column's threshold is chosen so it only appears when there is room for it
at ~its min-width, so whenever visible it renders at/above its min. On true mobile,
when even the minimal retained set can't fit, `table-fixed w-full` scales columns
down gracefully rather than overflowing.

---

## Approach B (primary): CSS container queries

1. **Add the plugin.** `npm i -D @tailwindcss/container-queries`; register it in
   [tailwind.config.js:33](tailwind.config.js#L33) `plugins: [...]`. (Confirm the
   `@container` / arbitrary-threshold variant syntax against the plugin docs during
   implementation, via the `ctx7` CLI.)

2. **Mark the container.** Add `@container/dt` (→ `container-type: inline-size`) to
   the DataTable wrapper `<div>` ([DataTable.tsx:78](src/components/DataTable/DataTable.tsx#L78)).

3. **Replace the viewport step maps with a container-query step ladder.** In
   [DataTable.tsx:11-22](src/components/DataTable/DataTable.tsx#L11-L22) the
   `HIDDEN_CELL` / `SPILLOVER_BLOCK` maps become an ordered ladder of **literal**
   container-query classes, e.g.:
   ```
   HIDDEN_CELL[step]    = "hidden @[<px>px]/dt:table-cell"   // in-table cell
   SPILLOVER_BLOCK[step] = "@[<px>px]/dt:hidden"             // More Info entry
   ```
   Keep the paired-map design so hide + spillover can never disagree. Provide enough
   steps to express 6–9 levels.
   - **CRITICAL JIT gotcha:** Tailwind's JIT only generates classes it finds as
     **literal strings** in source. Do **not** build class names dynamically
     (`` `@[${n}px]/dt:table-cell` `` won't compile). All threshold classes must be
     written out literally in the ladder constant. (If arbitrary literals prove
     fiddly, an equivalent native `@container` `<style>` block computed from minWidth
     is the escape hatch — and is essentially the bridge to C.)

4. **Column API.** In [types.ts](src/components/DataTable/types.ts) add
   `minWidth?: number` (documents the floor; also used to pick the step + as the
   `w-*`/`min-w` hint) and `collapseStep?: <ladder key>` (replaces `bucket`). Keep
   `spilloverLabel` / `noSpillover`. Mark `bucket` deprecated.

5. **Choose thresholds** by cumulative min-width: a column's show-threshold ≈ the sum
   of the min-widths of everything visible at/above it (selection + pinned button
   group + higher-priority columns + itself). Assign the ladder step nearest that
   sum, in the collapse order below.

6. **Merge actions + caret into one pinned column** — see "Shared work" below.

### Fallback C (if B misbehaves — JIT limits, threshold granularity, or a
container-query/containment edge case)
Swap only the hide/show driver: add a **width-measuring sibling to the existing
`useMeasuredHeight`** ([src/hooks/useMeasuredHeight.ts:9](src/hooks/useMeasuredHeight.ts#L9),
already `ResizeObserver`-based and already used on both pages —
[incidents/index.tsx:156](src/pages/incidents/index.tsx#L156),
[Reports/AllReportsList.tsx:279](src/pages/Reports/AllReportsList.tsx#L279)). Measure
the wrapper width, greedily keep columns by `collapsePriority` until their `minWidth`
sums exceed available, render the rest into spillover. **No new dependency** (native
browser API). The column metadata and merged-actions work from B carry over
unchanged — only the class-vs-state visibility switch differs.

---

## Shared work (same for B and C)

### DataTable.tsx / types.ts
- Add `minWidth?` (+ `collapsePriority?` used by the C fallback) to
  `DataTableColumn`; deprecate `bucket`.
- **Merge actions + caret into one pinned trailing column**: collapse the separate
  actions `<th>/<td>` ([112-120](src/components/DataTable/DataTable.tsx#L112-L120),
  [213-220](src/components/DataTable/DataTable.tsx#L213-L220)) and caret `<th>/<td>`
  ([121-129](src/components/DataTable/DataTable.tsx#L121-L129),
  [222-243](src/components/DataTable/DataTable.tsx#L222-L243)) into one column that
  renders `rowActions(row)` and the caret side by side in a single `inline-flex`
  group. Update `caretCol`/`actionsCol`/`totalCols`
  ([65-74](src/components/DataTable/DataTable.tsx#L65-L74)). Sized by
  `actionsColClassName`; always visible.
- Spillover `<dl>` ([296-314](src/components/DataTable/DataTable.tsx#L296-L314))
  continues to render hidden, non-`noSpillover` columns (driven by the same
  step/priority source).

### Alerts — `src/pages/Reports/TableView/reportColumns.tsx` + `ReportsTable.tsx`
Reorder to the todo's display order; set min-widths + collapse order:

| Display | id | minWidth | collapse order (1=last to go) |
|--|--|--|--|
| 1 platform | platform | 140 | 1 (most persistent) |
| 2 status | status | 140 | 6 |
| 3 date | date | 200 | 2 |
| 4 ASN/Network/Geo | source | 200 | 5 |
| 5 Incident | incident | 200 | 4 |
| 6 signal | signal | 175 | 7 (collapses first) · keep `noSpillover` |

Collapse first→last: signal → status → Incident → ASN → date → platform stays.
Button group (min 175) pinned. In `ReportsTable.tsx` set `actionsColClassName` to fit
the group (~`w-44`, ≥175px); keep `hideExpandBar`/`connectedExpanded` (caret now lives
inside the group).

### Incidents — `src/pages/incidents/TableView/IncidentsTable.tsx`
Reorder to the todo's display order; keep the existing `asn` column provisionally:

| Display | id | minWidth | collapse order (1=last to go) | notes |
|--|--|--|--|--|
| 1 ID# | idnum | 100 | 1 (most persistent) | |
| 2 title | title | 300 | 2 | grows to fill slack |
| 3 date | date | 220 | 4 | |
| 4 status | status | 240 | 5 | |
| (ASN) | asn | 160 | 6 | **left as-is provisionally** |
| 5 DPC | dpc | 100 | 7 | keep `noSpillover` (shown in detail) |
| 6 IPC | ipc | 100 | 8 | keep `noSpillover` (shown in detail) |
| 7 #alerts | alertsReport | 100 | 9 | |
| 8 Assigned to | assignedTo | 140 | 10 (collapses first) | |

Button group (open/edit/delete + caret, min 175) pinned. Keep `noSpillover` on the
columns already duplicated in the expanded metadata panel to avoid double-rendering.

### Docs — `docs/claude/architecture/alerts-incidents-tables.md`
Rewrite the "Layout model" + "Responsive buckets" sections for the container-query
engine (min-width + collapse steps, pinned button group, merged caret), note the C
fallback, and check off the Todo section.

---

## Verification (no test runner configured — manual)
1. `npm run dev`; open `https://localhost:8000` → Reports (alerts) and Incidents.
2. Resize the window wide→narrow **and toggle the sidebar** (container-query check —
   collapse must track the *table's* width, not just the window) and confirm:
   - **No horizontal scrollbar ever** on either table or the page.
   - Columns drop into "More Info" in the specified order (alerts: signal, status,
     Incident, ASN, date…; incidents: Assigned to, #alerts, IPC, DPC, ASN, status…).
   - Visible columns render at/above their min-widths until the mobile floor.
   - **Button group + caret are one group**, always visible on the right.
   - Sticky header still pins under the filters bar (`--dt-sticky-top`), light + dark
     — specifically confirm the `container-type` wrapper didn't disturb it.
3. Expand rows: "More Info" lists exactly the currently-hidden columns; DPC/IPC/etc.
   aren't duplicated; expanded detail still scrolls internally only.
4. Selection/compare mode (leading checkbox) still lays out correctly.
5. **Build check:** `npm run build` — confirms the arbitrary container-query classes
   actually compiled (JIT literal gotcha). If any collapse class is missing at
   runtime, that's the JIT issue → switch to fallback C.

## Notes
- Incidents ASN column is intentionally left untouched pending the user's separate
  change; its min-width/step above are provisional.
- Per project convention, any new hook (the C fallback's width measurer) lives beside
  `useMeasuredHeight` in `src/hooks/`.
- Plan-mode restricts edits to this file; per your preference I'll also save a copy
  into `docs/claude/plans/` as the first implementation step.
