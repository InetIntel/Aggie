# Why the Alerts & Incidents pages re-render so frequently

## TL;DR

It's not the compare feature. There are **several independent re-render drivers**
already baked into both pages. Ranked by how often each fires:

1. **`react-time-ago` tickers** on every alert row — self-update on their own timer
   (~1s for recent items). This is the constant "list is thrashing" symptom on
   **Alerts**. (Incidents rows use a static formatter, so they don't have this.)
2. **Socket-listener churn** on both pages — the subscribe effect re-binds on every
   render and logs to the console, which *reads* as constant activity.
3. **`isFetching` pulses** — `refetchInterval: 120000` + `refetchOnWindowFocus`
   (v4 default on) + dev-only `React.StrictMode` double-render.
4. **Whole-list cache replacement** — a single user action (mark read / tag / assign /
   close) re-renders every row on the page, even rows the change didn't touch.

None of these are caused by the "Compare in list view" change.

---

## 1. The constant one (Alerts rows): `react-time-ago`

Each alert row renders its timestamp through
[`DateTime.tsx`](../../../src/components/DateTime.tsx#L34-L37) →
`<ReactTimeAgo timeStyle='twitter' />`.

`react-time-ago` runs its **own internal timer and self-updates** to keep
"5s ago / 1m ago" current — for recent items that's roughly every second. With ~50
rows, that's a steady stream of small updates. In React DevTools "highlight updates"
it looks like the whole list is re-rendering nonstop.

- **Alerts-only.** Alerts rows use `DateTime` (via `ReportListItem` →
  `SocialMediaListItem`).
- **Incidents are not affected here** — `IncidentListItem` uses the static
  `formatDateTime` ([`IncidentListItem.tsx:128`](../../../src/pages/incidents/IncidentListItem.tsx#L128)),
  which has no ticker.

Note: `ReactTimeAgo` only re-renders **itself**, not the parent page — so this shows
up as many small row-level updates, not a top-level page render.

---

## 2. Makes it *look* frantic on both pages: socket-listener churn

`handleSocketUpdate` is redefined on every render, and
[`useSocketSubscribe`](../../../src/hooks/WebsocketProvider.tsx#L67-L88) has
`[eventHandler]` in its dependency array. So **every render tears down and re-adds the
socket listener** and logs:

```
SocketIO: removing listener groups:update
SocketIO: adding listener groups:update
```

- Present on both pages:
  [`Reports/index.tsx:90`](../../../src/pages/Reports/index.tsx#L90) (`reports:update`)
  and [`incidents/index.tsx:159`](../../../src/pages/incidents/index.tsx#L159)
  (`groups:update`).
- This does **not cause** renders — it's a *symptom* of them — but the console spam
  makes the pages look like they're re-rendering constantly, and it wastes work each
  render.

**Fix:** wrap the handlers in `useCallback` (or store in a ref) so the effect binds
once.

---

## 3. The 2-minute + focus pulses (both pages)

- **`refetchInterval: 120000`** on both queries
  ([`AllReportsList.tsx:98`](../../../src/pages/Reports/AllReportsList.tsx#L98),
  [`incidents/index.tsx:64`](../../../src/pages/incidents/index.tsx#L64)) → a
  background refetch every 2 min toggles `isFetching`, and both pages read
  `isFetching` in render (the refresh button spinner), so the whole page re-renders
  twice per cycle (false→true→false).
- **`refetchOnWindowFocus` is not disabled** — v4 default is `on`, with a 10s global
  `staleTime` ([`index.tsx:25-40`](../../../src/index.tsx#L25-L40)). Every tab
  focus/blur triggers a refetch → another page render.
- **`React.StrictMode`** ([`index.tsx:43`](../../../src/index.tsx#L43)) intentionally
  double-renders every component **in dev only**. So everything you see renders twice
  during development; this disappears in production.

---

## 4. "One action re-renders everything"

When a `reports:update` / `groups:update` socket event arrives (any user marking read,
tagging, assigning, closing — these are the **only** things that emit these events;
the fetching pipeline does not), the handlers rebuild the cached list with
[`updateByIds`](../../../src/utils/immutable.ts#L38) (`list.map(...)`) wrapped in a
fresh object:

```ts
queryClient.setQueryData(queryKey, { ...data, results: updateData });
```

`list.map(...)` returns a **new array**, and the spread returns a **new object** —
**always a new reference, even when none of the changed ids are on the current page**.
React Query then notifies subscribers, `useQuery` returns new `data`, and because
`reports.results` / `data.results` is a new array and the row components are **not
memoized**, the entire list + every row re-renders.

Relevant handlers:
- Alerts: [`Reports/index.tsx:50-89`](../../../src/pages/Reports/index.tsx#L50-L89)
- Incidents: [`incidents/index.tsx:133-148`](../../../src/pages/incidents/index.tsx#L133-L148)

---

## Bottom line per page

- **Alerts:** the visible "always re-rendering" is almost certainly `react-time-ago`
  (row-level), on top of the isFetching pulses and StrictMode dev double-render.
- **Incidents:** mostly the isFetching pulses (interval + focus) + StrictMode
  double-render. Also worth noting: **each incident row runs its own
  `useQuery(["session"])`**
  ([`IncidentListItem.tsx:55-59`](../../../src/pages/incidents/IncidentListItem.tsx#L55-L59)) —
  React Query dedupes the network call, but every row still subscribes and re-renders
  when session data changes.

---

## Suggested fixes (cheap → high-impact)

1. **`useCallback` the two socket handlers** — stops the listener re-bind churn and the
   console spam. (`handleSocketUpdate` in `Reports/index.tsx` and `incidents/index.tsx`.)
2. **`React.memo` on `ReportListItem` / `IncidentListItem`** — so a single row's
   timestamp ticker and unrelated cache writes don't force siblings to re-render. Needs
   stable props (pairs well with #1 and passing stable callbacks).
3. **`refetchOnWindowFocus: false`** (globally in the `QueryClient` defaults, or
   per-query) if focus refetches aren't wanted.
4. **Optional:** in the socket handlers, skip `setQueryData` when none of
   `message.data.ids` intersect the cached `results` — avoids replacing the whole list
   when the change isn't on screen.
5. **Optional:** lift the per-row `useQuery(["session"])` in `IncidentListItem` up to
   the page (or a context) so it isn't subscribed once per row.

Diagnostics-first alternative: drop a render counter / `console.count` into the page and
row components to confirm which driver dominates in the actual environment before
changing anything.
