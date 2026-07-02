# Retain Scroll Position on Incidents List

## Context

Today, when a user is browsing the incidents list at `/incidents`, clicks into an incident detail at `/incidents/:id`, and hits the "Go Back" button, they are dropped at the top of the list and have to re-scroll to find where they were. Filters and page number already persist (they live in URL search params), so the only thing being lost is scroll position. The list page even *actively* re-scrolls `#main_view` to the top every time `searchParams` changes, which fires on remount.

We want a small UX fix: returning to the list from a detail view should land the user back where they were. Filter and page changes should still scroll to top (today's behavior). Persistence is in-memory only — a hard reload or new tab starts fresh.

## Approach

Use react-router-dom v6's `useNavigationType()` to distinguish a back-navigation (`POP`) from a fresh navigation (`PUSH`/`REPLACE`), and stash the last-known scroll offset of the `#main_view` container in a module-level variable.

- On `POP` mounts, suppress the existing scroll-to-top and restore the saved offset once list data has rendered.
- On any other mount or on `searchParams` change, keep the current scroll-to-top behavior.
- On unmount (or on item click — unmount is enough), capture `#main_view.scrollTop` into the module variable.

No new dependencies. No sessionStorage. No changes to `IncidentListItem` or the detail page.

## Files to modify

- [src/pages/incidents/index.tsx](../../src/pages/incidents/index.tsx) — only file touched.

## Implementation sketch

In `src/pages/incidents/index.tsx`:

1. Add `useNavigationType` to the `react-router-dom` import.
2. Above the component, add a module-scoped `let savedScrollTop: number | null = null;`.
3. Inside `Incidents`:
   - `const navigationType = useNavigationType();`
   - Modify the existing `useEffect` at `src/pages/incidents/index.tsx:34-42`: skip the `scrollTo({ top: 0 })` when `navigationType === "POP"` (let the restore effect handle it). Keep `document.title` and `refetch()` behavior.
   - Add a new effect with deps `[data, navigationType]` that runs once when `data` is present and `navigationType === "POP"` and `savedScrollTop != null`: call `document.getElementById("main_view")?.scrollTo({ top: savedScrollTop })` (no `behavior: "smooth"` — instant feels right for restoration), then null out `savedScrollTop` so it isn't re-applied if `data` later refetches.
   - Add a mount effect whose cleanup reads `document.getElementById("main_view")?.scrollTop` into `savedScrollTop`. This captures the position right before unmount (i.e., when navigating into a detail).

## Why this works with the existing stack

- The list query key is the static `["groups"]` (`src/pages/incidents/index.tsx:27`), so on back-nav TanStack Query serves the cached results immediately and the list height is reconstructed before the restore effect fires. No layout-jump race.
- Filter/page changes call `setParams` which is a `PUSH`, so `navigationType` becomes `PUSH` and the existing scroll-to-top still fires.
- Detail's "Go Back" already uses `navigate(-1)` (`src/pages/incidents/Incident/index.tsx:202`), which produces a `POP` — exactly what triggers restore.
- Browser back from anywhere else into `/incidents` is also `POP`; restoring to the last-saved offset is still the right behavior because that offset is from the user's last visit.

## Verification

1. `npm run dev` and open `https://localhost:8000/incidents`.
2. Scroll partway down the incidents list, click into an incident, click "Go Back" — list should be at the same scroll position (not the top).
3. From the detail page, use the browser back button — same restore behavior.
4. On the list, change a filter or page in `IncidentsFilters` — should still scroll to top.
5. Hit refresh on the list page — should load at the top (no persistence across reload, as designed).
6. Navigate to incidents from the sidebar / a bookmark on a fresh tab — should load at the top.
7. With a long list, confirm there is no visible flash of "top of list" before the restore lands (cached data should be available synchronously on POP).
