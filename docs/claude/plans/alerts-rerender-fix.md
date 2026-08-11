# Fix: Alerts page refreshes / wipes progress on every interaction

> **Status (2026-08-11):** steps 1–6 were implemented, then **reverted** once the real
> cause of the reported symptom was found (below). This doc is now a backlog of genuine
> perf improvements, not a fix for the "refresh" bug. Only the media-store change shipped.
>
> **⚠️ The "hard refresh" symptom was NOT any of the causes theorized below.** Runtime
> diagnosis (render counters resetting + console clearing on every "refresh", **no 401**,
> both `/alerts` AND `/incidents` affected while idle) proved it was a **full page reload
> triggered by the CRA dev server**, not a 401 reload and not a re-render.
>
> Root cause: the FETCH process writes fetched images + IODA SVG charts into `public/media`
> ([socialImageStorage.js](../../../backend/fetching/utils/socialImageStorage.js), old default
> `MEDIA_ROOT`), and CRA 5's webpack-dev-server watches `public/` and live-reloads the
> browser on every write. **Fix (shipped on this branch):** the `MEDIA_ROOT` default now
> resolves to `media-store/` in dev and `public/media` only in production — one change in
> `socialImageStorage.js`; `/media` is still served by the backend via `getMediaRoot()`, so
> no frontend/serve change and no env var required. `media-store` gitignored; `.env.example`
> documents the optional override. Steps 1–6 remain valid re-render/scroll/socket
> improvements but were never the cause of the reload — reverted; pursue as a separate perf PR.


## Context

On the Alerts view (`/alerts` = `AllReportsList alerts={true}`), users report that:
- clicking a row to view an alert's info "refreshes" the page,
- clicking a compare checkbox "refreshes" the page,
- and just sitting on the page it periodically refreshes,

and in each case it **wipes their selection/compare progress and scrolls to the top**.

This traces to four independent drivers, all confirmed by reading the code. None are
caused by the compare feature itself. The earlier note
[`rerender-frequency-findings.md`](./rerender-frequency-findings.md) covered the
time-based drivers; this plan is the fix, and adds the interaction/navigation drivers
that explain the "wipes progress + scrolls to top" part.

### Root causes

1. **Whole-list re-render on any interaction.** All interaction state lives at the top
   of [AllReportsList.tsx](../../../src/pages/Reports/AllReportsList.tsx) (`compareMode`,
   `compareOpen`, `useMultiSelect`, `useMeasuredHeight`). Rows
   ([ReportListItem.tsx](../../../src/pages/Reports/components/ReportListItem.tsx)) are
   **not** `React.memo`'d, and each render recreates `reportsQueryKey`, `platformOptions`,
   and the inline row callbacks — so even adding `React.memo` won't help until those props
   are stabilized. One checkbox click re-renders every row.
2. **Focus + periodic refetch.** [index.tsx](../../../src/index.tsx) leaves
   `refetchOnWindowFocus` at v4's default (`true`) with a 10s `staleTime`; the alerts
   query sets `refetchInterval: 120000` and has no `keepPreviousData`. So the list
   refetches on every tab refocus and every 2 min, and blanks to a loading state whenever
   the query key changes.
3. **Reset effect scrolls to top + wipes selection.** The `useEffect` at
   [AllReportsList.tsx:106-115](../../../src/pages/Reports/AllReportsList.tsx#L106-L115)
   unconditionally clears selection/compare and scrolls `#main_view` to top. Unlike the
   incidents page ([incidents/index.tsx:115-145](../../../src/pages/incidents/index.tsx#L115-L145)),
   it does **not** save/restore scroll and does **not** skip on back-navigation (`POP`) —
   so returning from a report detail scrolls to top and loses progress.
4. **List↔table view toggle can remount `AllReportsList`.** [Reports/index.tsx](../../../src/pages/Reports/index.tsx)
   returns two structurally different layout trees for list vs table; the differing
   sibling structure around `<main>{children}</main>` lets React remount the child on
   toggle, firing its mount reset effect (scroll-to-top + state wipe).

Plus a symptom amplifier: the socket handler in
[Reports/index.tsx:50-90](../../../src/pages/Reports/index.tsx#L50-L90) is redefined every
render and [`useSocketSubscribe`](../../../src/hooks/WebsocketProvider.tsx#L67-L88) depends
on `[eventHandler]`, so the listener re-binds on every render (console spam + wasted work).

Intended outcome: local interactions (checkbox, open detail) re-render only the affected
row; background refetches don't blank or scroll the list; returning from a detail preserves
scroll and selection.

### ⚠️ Prime suspect for the *hard* "refresh" (confirm at runtime first)

There are really **two different symptoms** hiding under "refresh":

- a **soft** re-render/reload (flash, list re-draws) — causes 1-4 above, and
- a **hard full-page reload** that clears everything and scrolls to top.

The hard reload has a single, definitive source: the global query `onError` in
[index.tsx:29-37](../../../src/index.tsx#L29-L37) calls **`window.location.reload()` on any
`401`**. This applies to *every* query on the page — the alerts list (refetches every 2 min
via `refetchInterval` and on tab focus), the per-row `["group"]` queries, `["session"]`,
etc. If any of them intermittently 401s, the whole page hard-reloads — which matches
"periodically refreshes, wipes progress, scrolls to top" far better than a re-render does.

Why 401s are plausible here: [index.tsx:17-18](../../../src/index.tsx#L17-L18) sets
`axios.defaults.withCredentials = true` and `axios.defaults.baseURL =
process.env.PUBLIC_URL || 'http://localhost:3000'`. In dev the app is served from `:8000`
but this base URL points requests directly at `:3000`, **bypassing the CRA proxy in
[setupProxy.js](../../../src/setupProxy.js)** and making them cross-origin — a classic setup
for the session cookie to intermittently not attach (SameSite/domain), yielding sporadic
401s → reloads.

**Confirm before fixing:** open DevTools → Network + Console, leave the page idle, and watch
for a `401` immediately followed by a document reload (the console clears). If you see that,
this is the dominant cause and steps 1-6 below are secondary polish. If you *don't* see
401s/reloads, it's the re-render cascade (steps 1-3) and the scroll effect (step 4).

**Runtime observation (incidents → alerts navigation, 2026-08-11):** the console showed
**no `401` and no document reload** — the startup banner/warnings stayed in place, so this
navigation is confirmed **soft** (re-render, not hard reload). The idle-401 test is still
outstanding; it's a different trigger than navigation. Two things *were* confirmed:
- **Socket re-bind churn is real (step 6).** `SocketIO: adding listener / removing listener`
  cycled repeatedly for `reports:update` and `groups:update` (the latter ~4×) during a single
  navigation — direct evidence of the `useSocketSubscribe` `[eventHandler]` re-bind bug and of
  multiple components re-rendering several times each.
- **Cross-origin socket transport fails.** Two `WebSocket connection to
  'ws://localhost:3000/socket.io/…' failed` — socket.io can't upgrade to the websocket
  transport at `:3000` and falls back to polling (still "Connected and authenticated").
  Corroborates the cross-origin `:8000 → :3000` setup flagged above as the plausible source of
  intermittent 401s.

**Fix (step 0 — CONDITIONAL, not in the primary PR):** the navigation capture showed no
401/reload, so step 0 is *not* required for the symptoms reproduced so far. Gate it on the
idle-401 test and split it by risk:
- **0.1 — replace `window.location.reload()` with an in-app redirect** to the login route
  (SPA `navigate`, preserving `?to=`) — the commented-out code at
  [index.tsx:34-35](../../../src/index.tsx#L34-L35) already sketches this. `AppRouter`
  already bounces unauthenticated users to `/login` on session error, so the reload is
  redundant and destructive. Cheap defensive cleanup. **Only fold into the primary PR if the
  idle-401 test actually catches a 401 → console-clear;** otherwise defer.
- **0.2 — point `axios.defaults.baseURL` through the proxy in dev** (leave it unset / relative
  so `/api` uses `setupProxy.js`) so the session cookie is same-origin, killing both the
  intermittent 401s and the `ws://localhost:3000` upgrade failures. Higher risk (must verify
  `PUBLIC_URL`/production isn't broken) — **its own separate PR regardless.**

## Approach (ordered, low-risk first)

**PR scope (recommended):** the primary PR is **steps 1–6** — the re-render/scroll/socket
fixes your runtime evidence supports. **Step 0 is excluded** (conditional 0.1, separate-PR
0.2 — see above). **Step 7** (table-view parity) is optional follow-up.

### 1. Stop focus/periodic refetch from blanking & thrashing
- **[AllReportsList.tsx](../../../src/pages/Reports/AllReportsList.tsx) query (lines 89-105):**
  add `keepPreviousData: true` (v4 — not v5 `placeholderData`) and
  `refetchOnWindowFocus: false`. Keep `refetchInterval: 120000`. The existing `isFetching`
  spinner (line 293) still signals background fetches.
- **[index.tsx](../../../src/index.tsx) `defaultOptions.queries`:** add
  `refetchOnWindowFocus: false` app-wide (incidents has the same pattern). Leave
  `staleTime: 10000`.

### 2. Stabilize props passed to rows (prerequisite for step 3)
In [AllReportsList.tsx](../../../src/pages/Reports/AllReportsList.tsx):
- `useMemo` `reportsQueryKey` (deps `[alerts, queryParamsString]`) and `platformOptions`
  (deps `[alerts]`).
- The row callbacks (`onReportCheck`, `onReportItemClick`) read live state, so a plain
  `useCallback` would still churn. Add a small scoped `useEventCallback` hook under
  `src/pages/Reports/` (latest-ref + `useCallback((...a) => ref.current(...a), [])`) and
  wrap both so their identity is constant while bodies stay unchanged.

### 3. Memoize the list row
In [ReportListItem.tsx](../../../src/pages/Reports/components/ReportListItem.tsx):
- Change props so the row owns its click logic: pass stable `onCheck(report)` /
  `onOpen(report)` + `compareMode` + `currentPageId` instead of pre-bound inline closures,
  and move the clickable wrapper `<div>` (currently
  [AllReportsList.tsx:387-397](../../../src/pages/Reports/AllReportsList.tsx#L387-L397))
  into the row.
- `export default React.memo(ReportListItem)`. Shallow compare is enough once step 2 lands
  and because [`updateByIds`](../../../src/utils/immutable.ts#L38) preserves unchanged item
  refs. Per-row `useQuery(["group"])` and mutation subscriptions still re-render the row on
  their own data changes, so memo hides nothing.

### 4. Preserve scroll + selection across navigation (the "scrolls to top" fix)
In [AllReportsList.tsx](../../../src/pages/Reports/AllReportsList.tsx), mirror the incidents
pattern at [incidents/index.tsx:115-145](../../../src/pages/incidents/index.tsx#L115-L145):
- Add module-scope `let savedScrollTop`; import `useLayoutEffect` + `useNavigationType`.
- In the reset effect, only `scrollTo({top:0})` when `navigationType !== "POP"`. Do **not**
  add `refetch()` here (alerts' key already changes on filter — would double-fetch).
- Add a passive `scroll` listener effect saving `savedScrollTop`, and a `useLayoutEffect`
  that restores it when `navigationType === "POP" && reports?.total`.

### 5. Remove the view-toggle remount
In [Reports/index.tsx](../../../src/pages/Reports/index.tsx): first confirm the remount
(temporary `useEffect(() => console.log("mount"), [])` in `AllReportsList`, toggle view).
Then restructure so a single shared `<main key="reports-main">{children}</main>` is written
once and only the surrounding chrome (right `<aside>` vs fixed drawer) varies by `listView`.
Preserve the exact `grid grid-cols-3` / `col-span-*` classes for list view.

### 6. Stop socket re-bind churn — ✅ runtime-confirmed (see observation above)
In [Reports/index.tsx](../../../src/pages/Reports/index.tsx): wrap `handleSocketUpdate` in
the `useEventCallback` hook from step 2 so `useSocketSubscribe("reports:update", …)` binds
once. (Optional follow-up, separate PR: fix `useSocketSubscribe` itself to ref-latest the
handler for all callers — incidents has the same bug.)

### 7. (Lower priority) Table-view parity
In [ReportsTable.tsx](../../../src/pages/Reports/TableView/ReportsTable.tsx): `useMemo` the
`columns` and `useCallback` `rowActions`/`expandedContent` (keyed on the now-stable
`queryKey`). Check whether `DataTable` memoizes rows; if not, follow up separately.

## Critical files
- [src/pages/Reports/AllReportsList.tsx](../../../src/pages/Reports/AllReportsList.tsx) — query opts, prop memoization, reset/scroll effects
- [src/pages/Reports/components/ReportListItem.tsx](../../../src/pages/Reports/components/ReportListItem.tsx) — `React.memo` + owns click logic
- [src/pages/Reports/index.tsx](../../../src/pages/Reports/index.tsx) — shared `<main>`, stable socket handler
- [src/index.tsx](../../../src/index.tsx) — global `refetchOnWindowFocus: false`
- New: `src/pages/Reports/useEventCallback.ts` (scoped hook)
- Reference only: [src/pages/incidents/index.tsx](../../../src/pages/incidents/index.tsx) (scroll save/restore)

## Verification
1. `npm run dev`, open `/alerts`. Note React runs under `StrictMode` in dev (double-renders)
   — verify against production build too if measuring precisely.
2. Drop a `console.count("row render")` in `ReportListItem` and `console.count("list render")`
   in `AllReportsList`. Toggle a compare checkbox → only the clicked row should count up;
   the list should not re-render every row.
3. Open a report (list view) then press browser Back → page stays at prior scroll position;
   compare/selection intact; no scroll-to-top.
4. Leave the page idle >2 min and switch tabs and back → no loading blank, no scroll jump;
   `isFetching` spinner may flash but rows stay put.
5. Toggle list↔table repeatedly → selection/compare survive; the temporary mount `console.log`
   fires only once.
6. Confirm read / ignore / investigate optimistic updates still reflect immediately, and that
   incoming socket `reports:update` events update only affected rows (no console "adding/
   removing listener" spam on every render).
