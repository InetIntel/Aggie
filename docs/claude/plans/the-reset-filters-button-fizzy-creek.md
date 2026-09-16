# Fix: "Reset filters" button appears when toggling Alerts list→table

## Context

On the **Alerts** page (`src/pages/Reports/`, `alerts` mode), toggling from list view to
table view makes the "Reset filters" button appear even when **no filter is applied**.

Why: the list/table toggle is stored as a URL query param (`view=table`), added by
`setParams({ view: "table" })` in `AllReportsList.tsx`. The Reset-filters button in
`ReportsFilters.tsx` is gated on `!!searchParams.size`, which counts **every** param —
including the UI-only `view` toggle. So with zero real filters, switching to table view
takes `searchParams.size` from 0 → 1 and the button shows.

The Incidents page already handles this correctly by excluding `view` from its
"is a query active?" test (`_.omit(getAllParams(searchParams), "view")` in
`src/pages/incidents/index.tsx:46-47`). Alerts just never got the same guard. `view` is
the only UI-only param that lands in the URL without a real filter, so it's the only one
to exclude — matching the Incidents behavior (pagination etc. still count).

Intended outcome: the Reset-filters button appears only when an actual filter/search is
active, regardless of which view (list/table) is selected.

## Change

**File:** `src/pages/Reports/components/ReportsFilters.tsx`

Replace the `!!searchParams.size` gate (line ~211) with a check that ignores the `view`
param. `searchParams` is already destructured from `useQueryParams` at the top of the
component (no new imports needed):

```tsx
// The `view` param is the list/table UI toggle, not a filter — exclude it so
// switching to the table view doesn't make the bar think a query is active and
// surface the "Reset filters" button. Mirrors the Incidents guard
// (src/pages/incidents/index.tsx).
const hasActiveFilter = Array.from(searchParams.keys()).some(
  (key) => key !== "view"
);
```

Then gate the button on it:

```tsx
{hasActiveFilter && (
  <AggieButton
    type='button'
    variant='secondary'
    ...
  >
    <FontAwesomeIcon icon={faXmarkSquare} />
    Reset filters
  </AggieButton>
)}
```

No other change is required. `clearAllParams()` (the button's onClick) already wipes all
params; since `localStorage["alerts:view"]` still holds `"table"`, the view stays on table
after a reset (the `view` derivation in `AllReportsList.tsx` falls back to localStorage).

## Verification

Run the app (`npm run dev`, open `https://localhost:8000`) and, on the **Alerts** page:

1. With no filters applied and the URL clean (`/reports/...` with no query string), confirm
   the "Reset filters" button is **hidden** in list view.
2. Click **Table** → URL gains `?view=table`, results are unchanged, and the "Reset filters"
   button stays **hidden** (this is the bug being fixed).
3. Apply any filter (e.g. a Platform or the search box) → "Reset filters" **appears** in both
   list and table views.
4. Click **Reset filters** → filters clear and the button disappears; the view remains on
   table (localStorage-backed).
5. Regression check on **Social Media Posts** mode (no table view) and on the Incidents page —
   both should behave exactly as before.

## Follow-up: second cause of the same false-positive

Opening the **Outage start** date dropdown and closing it without picking a date also
surfaced "Reset filters". `FilterDateTime` fires `update()` on close, calling
`onSetBefore("")`/`onSetAfter("")` → the parent `setParams`. That wrapper's
`showEntityLevelFilter` branch injected the entity-level defaults and a
`hideDuplicateASNs` value into the params on **every** call, materializing the invisible
defaults into the URL — so an unrelated (or empty) change made `hasActiveFilter` true.

**Fix** (`src/pages/Reports/components/ReportsFilters.tsx`, `setParams`): only run the
entity-level/dedup normalization when the caller is actually changing one of them
(`"entityLevel" in values || "hideDuplicateASNs" in values`); otherwise leave those params
untouched. First-load behavior is unchanged (defaults were never in the URL until a
setParams call anyway), and explicit entity-level selections + auto-dedup still work.

Verify: open Outage start, click away without selecting → button stays hidden; pick a date
→ button appears; change Entity Level to AS + AS-Country → dedup auto-enables as before.

## Note

Per project preference, this plan file lives in `docs/claude/plans/` in the repo (plan mode
only permitted writing to the scratch plan path, so it was copied here on implementation).
