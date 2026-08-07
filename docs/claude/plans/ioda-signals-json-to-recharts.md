# Plan: Store IODA charts as signal JSON and render with recharts (drop the SVG scrape)

> **Status: implemented.** Corrections found during implementation (this doc's original
> assumptions were partly wrong):
> - **Signals entity = raw `event.location`**, NOT the geoasn-stripped `entityCode`. The
>   dashboard link strips the `geo` prefix (`geoasn/47262-IR` → `asn/47262-IR`) for page routing,
>   but the signals API **rejects** the stripped form (HTTP 500) and wants `geoasn/47262-IR`.
>   `event.location` works for region/asn/geoasn alike. (See `iodaUtils.fetchSignals` + `ioda.js`.)
> - **`data` is nested** (`data[0]` is the series list) and **`values[]` carry no timestamps** —
>   points are reconstructed as `from + i*step`.
> - **`predicted` (gtr-norm/gtr-sarima) is essentially never populated** for region/asn/geoasn
>   outage entities (gtr returns no data for them). The band code stays but no-ops; the chart is
>   the 2–3 normalized signal lines.
> - **There is no `ExpandableChart.tsx`.** IODA rendering is inlined in `IodaEvent.tsx` and the
>   compare view `CompareCardBody.tsx` (where enlarge/zoom lives). A **new `IodaChart.tsx`** is
>   branched into both; the legacy `image` path stays as fallback.
> - **`useReportChartImage` was NOT renamed** — it still serves Cloudflare + legacy IODA images.
>   A sibling **`useReportChartSeries.ts`** returns the new `chart`.
> - **No DB projection existed**; the list serializer (`serializeReportResponse`) now strips
>   `chart` per row, detail keeps it.
> - **`jsdom` stays** in `package.json` (Mastodon uses it); only `playwright` + `dompurify` removed.
> - Normalization: each signal is scaled to **% of its own max** over the window (matches the
>   scraped 0–100% axis).

## Context

IODA outage reports show a chart. Today that chart is **not** data we own — on every
`fetch()` the IODA channel launches a **headless Chromium browser (Playwright)**,
navigates to IODA's public dashboard page, and **scrapes the already-rendered Highcharts
`<svg>` out of the DOM** ([iodaUtils.js:16-46](../../../backend/fetching/utils/iodaUtils.js#L16-L46)),
sanitizes it with DOMPurify, and stores the SVG string keyed by `guid`. The frontend
renders it as a static `<img src="/media/<key>">`.

This is the motivation for the sibling `media-bytes-to-mongodb.md` plan (make the SVG bytes
portable). But IODA is a special case: **the SVG is a render of time-series signal data
that IODA exposes directly via API.** Instead of storing rendered pixels, we can store the
small underlying JSON and draw the chart client-side. That:

- **deletes the entire Playwright/Chromium dependency** (a headless browser launched on
  every poll — heavy, slow, and silently brittle to IODA's dashboard DOM changes),
- makes the chart **travel inside the report document** (small JSON inline in `metadata`) —
  no `/media` bytes, no `mediaassets` collection for IODA at all,
- yields a **native, interactive** chart that faithfully mirrors IODA's dashboard, using
  `recharts` — already a dependency (`^2.1.9`) but currently imported nowhere.

**Net effect on the sibling plan:** IODA drops out of `media-bytes-to-mongodb.md` entirely;
only Mastodon/Telegram social images remain as actual bytes to migrate.

## Confirmed facts (verified live against IODA v2 API)

- `event.location` in the `outages/events` feed is already `entityType/entityCode`
  (e.g. `region/4442`), so the signals URL is simply
  `GET {IODA_BASE}/signals/raw/{event.location}?from=&until=`.
- That endpoint returns JSON: an array of datasource series, each with `datasource`,
  `subtype`, `step`, and `values[]` (numbers/`null`). Datasources present:
  `bgp`, `ping-slash24` (+ `-loss`/`-latency`), `merit-nt`, `gtr` (+ `gtr-norm`,
  `gtr-sarima`), `mozilla`. Steps differ per source (600s / 1800s / 3600s).
- IODA's dashboard normalizes each signal to a % of its "normal" level and overlays them,
  with `-norm`/`-sarima` giving the predicted band. To **match closely** we replicate that.

## Data model

Store the series inline on the report, replacing the `image` key. In `parseEvent`'s `raw`
object ([ioda.js:397-408](../../../backend/fetching/channels/ioda.js#L397-L408)):

```js
raw: {
  rawEvent, entityLevel, entityScope, entityName, dataSource, score,
  started, ended, duration,
  // NEW — replaces `image`:
  chart: {
    from, until,                 // window actually fetched (unix seconds)
    entity: event.location,      // "region/4442"
    series: [                    // one per plotted datasource
      { datasource: 'bgp', step, points: [[tsSec, value|null], ...] },
      { datasource: 'ping-slash24', step, points: [...] },
      { datasource: 'merit-nt', step, points: [...] },
      { datasource: 'gtr', step, points: [...] },
    ],
    predicted: {                 // for the "match closely" band
      datasource: 'gtr', step,
      norm:   [[tsSec, value], ...],   // gtr-norm
      sarima: [[tsSec, value], ...],   // gtr-sarima
    },
  },
}
```

- Keep it compact: `[ts, value]` pairs, not objects; request with `maxPoints` (~150) to cap
  size. Expect a few KB per report.
- **Window:** reuse the exact range the dashboard link already computes
  ([ioda.js:307-314](../../../backend/fetching/channels/ioda.js#L307-L314), `urlFromTime`/
  `urlToTime`) so the chart covers the same span IODA shows.
- Overwrite-in-place on re-fetch is automatic — the whole `metadata.rawAPIResponse` is
  reassigned for existing reports today ([ioda.js:196-198](../../../backend/fetching/channels/ioda.js#L196-L198)).

## Backend changes

### 1. `backend/config/fetching/externalApis.js` — add the signals route
Add `SIGNALS_RAW: 'signals/raw'` to `API_ROUTES.IODA`.

### 2. `backend/fetching/utils/iodaUtils.js` — replace the scrape with a fetch
- Add `fetchSignals({ entity, from, until, maxPoints })` — one `fetch` to
  `signals/raw/{entity}`, returns the parsed/normalized `chart` object above. Select the
  datasources we plot; map `-norm`/`-sarima` into `predicted`.
- **Remove** `extractCleanSVGFromPage` and its `playwright`/`jsdom`/`dompurify` imports.
  (Confirm no other caller — grep shows `extractCleanSVGFromPage` is IODA-only.)

### 3. `backend/fetching/channels/ioda.js` — stop launching a browser
- Delete the `chromium.launch()` / `this.browser` lifecycle in `fetch()`
  ([ioda.js:92-98](../../../backend/fetching/channels/ioda.js#L92-L98), [244](../../../backend/fetching/channels/ioda.js#L244))
  and the `require('playwright')` / `linkedPageCache` scrape path
  ([ioda.js:364-385](../../../backend/fetching/channels/ioda.js#L364-L385)).
- In `parseEvent`, call `fetchSignals(...)` with `event.location` and the existing
  `urlFromTime`/`urlToTime` window; assign the result to `raw.chart` instead of `raw.image`.
- Keep the `linkedPage` URL — still useful as the "view on IODA" link and unchanged
  elsewhere.

### 4. `backend/fetching/utils/socialImageStorage.js` — drop `persistSvgChart`
`persistSvgChart` becomes dead (IODA was its only caller). Remove it (and the
`ioda/charts/*` key/kind handling in the sibling Mongo plan). Social-image functions stay.

### 5. `backend/models/report.js` — project the series out of list rows
The list query currently ships the full doc because the old `image` was a tiny key
([report.js:314-320](../../../backend/models/report.js#L314-L320)). A few-KB series per row
× 50 rows is heavier, so **exclude `metadata.rawAPIResponse.chart`** from the list
projection and let the frontend lazy-load it per report (pattern already exists — see #7).

### 6. `package.json` — remove `playwright` (and `jsdom`/`dompurify` if now unused)
Grep for other users first; `jsdom`/`dompurify` are only referenced by the IODA scrape.

## Frontend changes

### 7. `useReportChartImage.ts` → `useReportChartSeries.ts`
Same lazy-load shape (list strips the field → fetch full report by id via `getReport`), but
return `metadata.rawAPIResponse.chart` instead of `.image`. Keep a legacy fallback so old
reports that still carry `.image` (key/inline SVG) keep working.

### 8. New `IodaChart.tsx` (recharts) + fold into `ExpandableChart.tsx`
- New data-driven chart component using `recharts` `ResponsiveContainer` + `LineChart`
  (or `AreaChart`): one `<Line>` per signal series over a numeric (unix-seconds) `XAxis`,
  differing `step`s handled by each series carrying its own `[ts, value]` points.
- **Match IODA closely:** normalize each series to % of its normal level and render the
  `predicted.norm`/`predicted.sarima` band as a shaded `<Area>` behind the lines.
- Reuse the existing signal palette from
  [reportParser.ts:87-95](../../../src/components/SocialMediaPost/reportParser.ts#L87-L95)
  (`signalToNameColor`: BGP `#33A02C`, Active Probing `#1F78B4`, Telescope `#ED9B40`).
- `ExpandableChart` keeps its compact height-cap + click-to-enlarge wrapper, but branches:
  `series` present → `<IodaChart>`; else legacy `image` → existing `<img>`/inline-SVG path.
- `IodaEvent.tsx` swaps `useReportChartImage` → `useReportChartSeries` and passes `series`
  to `ExpandableChart`.

### 9. `src/api/reports/types.ts`
Add the `chart` shape to `RawApiResponse` (keep `image?`/`imageUrl?` for legacy reports).

## Legacy / transition

Old IODA reports carry `metadata.rawAPIResponse.image` (a media key or inline SVG). Two
options — **recommend (a)** for simplicity:
- **(a) Leave them as-is.** `ExpandableChart` renders `series` when present, else falls back
  to the old `image` `<img>`. Old reports keep their scraped SVG; new reports use recharts.
  (If the sibling Mongo migration doesn't run, old keys still resolve from disk/`/media`.)
- (b) Optional backfill: a one-off script re-fetches signals for existing IODA reports
  (bounded by their stored window) and populates `chart`, then old `image` keys can be
  retired. Only worth it if a uniform look across old reports is required.

## Development & test fixtures

We already have a rich local corpus to build and visually validate against:
`public/media/ioda/charts/` holds **~1,300 real Highcharts SVGs** (`Created with
Highcharts 11.4.3`, `highcharts-areaspline-series` — so the recharts mirror is an
**`AreaChart`**, not a plain line chart). Representative cases: smallest ~130 KB, typical
~290 KB, stress-case ~5.6 MB.

**These SVGs are the ground-truth target, not the render input.** The recharts component
draws from **signals JSON** (live IODA API), so development needs *paired* fixtures — a
rendered SVG next to the signal JSON that produced it — to tune "match IODA closely"
side-by-side. The filename is `sha1(guid)` and can't be reversed, but the **report
documents carry the mapping**: `metadata.rawAPIResponse.rawEvent.location` (e.g.
`region/4442`) + start/end give the entity and window, and `rawAPIResponse.image` holds the
matching SVG key.

**Fixture-extraction script (dev-only, throwaway) → `scratchpad/`:**

- Connect to Mongo (reuse `backend/database.js`), pull ~10 IODA reports spanning entity
  types (region / asn / geoasn) and a size mix.
- For each: read `location` + the `[from,until]` window (mirror the dashboard window math
  in [ioda.js:307-314](../../../backend/fetching/channels/ioda.js#L307-L314)), fetch
  `signals/raw/{location}?from=&until=&maxPoints=150`, and write a fixture pair:
  - `scratchpad/ioda-fixtures/<guid>.signals.json` — the source JSON,
  - `scratchpad/ioda-fixtures/<guid>.reference.svg` — copied from
    `public/media/ioda/charts/<sha1>.svg` (the render target),
  - an `index.json` listing each pair with `location`, `datasource`, window, and byte sizes.
- Build `IodaChart.tsx` against these static JSON files first (no live fetch, no backend
  running); drop each `reference.svg` beside the recharts output to eyeball fidelity, then
  iterate on normalization + the `-norm`/`-sarima` band until they match.

This makes the frontend work fully offline and reproducible before any backend change lands.

## Files to modify

- `backend/fetching/channels/ioda.js` — remove browser/scrape; fetch + store signals JSON.
- `backend/fetching/utils/iodaUtils.js` — replace `extractCleanSVGFromPage` with `fetchSignals`.
- `backend/config/fetching/externalApis.js` — add `SIGNALS_RAW` route.
- `backend/fetching/utils/socialImageStorage.js` — remove dead `persistSvgChart`.
- `backend/models/report.js` — project `metadata.rawAPIResponse.chart` out of list rows.
- `package.json` — drop `playwright` (+ `jsdom`/`dompurify` if unused).
- `src/components/SocialMediaPost/IodaChart.tsx` — **new** recharts component.
- `src/components/SocialMediaPost/ExpandableChart.tsx` — branch series vs legacy image.
- `src/components/SocialMediaPost/useReportChartSeries.ts` — renamed hook returns `chart`.
- `src/components/SocialMediaPost/IodaEvent.tsx` — use the new hook.
- `src/api/reports/types.ts` — type the `chart` field.
- `docs/claude/plans/media-bytes-to-mongodb.md` — note IODA is now out of scope.
- `scratchpad/extract-ioda-fixtures.js` — **new**, dev-only; writes paired JSON+SVG fixtures.

## Verification

1. **Backend fetch:** run `npm run dev:backend`, trigger an IODA fetch → confirm a new IODA
   report has `metadata.rawAPIResponse.chart.series` populated (no `image`), and **no
   Chromium process launches** (previously visible in `ps`).
2. **Re-fetch/overwrite:** re-poll an ongoing outage → same report updated in place with a
   refreshed `chart` (no duplicate report).
3. **List vs detail:** confirm list rows omit `chart` (projection) and `GET /api/report/:id`
   returns it; the lazy hook fills the chart on demand.
4. **Frontend fidelity:** open an IODA report → recharts chart renders the signals with the
   correct colors and a predicted band, visually comparable to the same event on
   `ioda.inetintel.cc.gatech.edu`. Compact (table/compare) height-cap + click-to-enlarge
   still work.
5. **Legacy:** an existing pre-migration IODA report still renders its old scraped SVG via
   the `image` fallback.
6. **Cleanup:** grep confirms no remaining `playwright`/`extractCleanSVGFromPage`/
   `persistSvgChart` references; `npm run build` succeeds.
