# IODA v2 API — can we get a URL to the SVG alert/event charts?

> **Investigation only — no code change.** Conclusion documented for future reference.

## Context

Aggie currently obtains the IODA outage chart by launching a headless Playwright/Chromium browser on **every** fetch, navigating to the IODA dashboard page, waiting for Highcharts to render, and scraping the `svg.highcharts-root` element out of the DOM ([iodaUtils.js:16-46](../../backend/fetching/utils/iodaUtils.js#L16-L46), called from [ioda.js:364-385](../../backend/fetching/channels/ioda.js#L364-L385)). That scrape is heavy and fragile (it depends on the dashboard's DOM, a `data-highcharts-chart` index hack, and a 30s render wait). The question: **does the IODA v2 API expose a URL/endpoint that returns the chart SVG directly, so we could skip the browser scrape?**

## Conclusion

**No.** The IODA v2 API has **no chart-image endpoint** — nothing returns a rendered SVG/PNG, and nothing returns a URL to one.

Evidence:
- Enumerated every controller in [InetIntel/ioda-api](https://github.com/InetIntel/ioda-api): `Api`, `Datasources`, `Entities`, `Outages`, `Signals`, `Topo`, `SymUrl`. A grep across all of them for `svg|png|image|chart|render|highchart` returned **nothing**.
- Cross-checked the [CAIDA ioda-api API Specification](https://github.com/CAIDA/ioda-api/wiki/API-Specification) — no image/chart endpoint listed.
- The charts on the IODA dashboard are rendered **client-side by Highcharts** from raw time-series JSON. That is precisely why Aggie has to scrape the rendered DOM — there is no server-rendered image to fetch.

## What the API *does* expose (verified live, HTTP 200)

The data behind the dashboard chart is available directly:

```
GET https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/{entityType}/{entityCode}
      ?from={unixSeconds}&until={unixSeconds}&datasource={bgp|merit-nt|ping-slash24|gtr|...}&maxPoints={n}

→ { type: "signals", metadata, requestParameters, error, perf,
    data: [ [ { entityType, entityCode, datasource, subtype, from, until,
                step, nativeStep, values: [ ...numeric measurements... ] } ] ] }
```

This is the same `/signals/raw/...` time-series the dashboard's Highcharts consumes. So: **no chart URL, but the chart data is directly available.**

### Endpoints relevant to Aggie (v2, `https://api.ioda.inetintel.cc.gatech.edu/v2/`)

| Endpoint | Returns | Used by Aggie today |
|---|---|---|
| `entities/query` (`?entityType=&relatedTo=`) | entity code→name metadata | yes ([ioda.js:39](../../backend/fetching/channels/ioda.js#L39)) |
| `outages/events` (`?entityType=&relatedTo=&from=&until=`) | outage event list | yes ([ioda.js:109](../../backend/fetching/channels/ioda.js#L109)) |
| `signals/raw/{entityType}/{entityCode}` (`?from=&until=&datasource=&maxPoints=`) | chart time-series JSON | **no — this is the data we'd need to render charts ourselves** |
| `outages/alerts/{...}`, `outages/summary/{...}`, `datasources/{...}`, `topo/{...}` | alerts / scores / datasource meta / topojson | no |

## Decision

**Keep the current Playwright scrape.** Findings documented only — no migration. The scrape produces a pixel-perfect copy of the real dashboard chart, and the recently-built media-storage SVG path ([move-ioda-svg-to-media-storage.md](./move-ioda-svg-to-media-storage.md)) stays as-is.

## Noted for the future (not in scope now)

If the Playwright scrape ever becomes a maintenance burden, the `signals/raw` endpoint unlocks two browser-free alternatives:

1. **Frontend render** — fetch `signals/raw` in the channel, store the compact time-series JSON on the report, render the chart in a React component. Removes Playwright, jsdom, DOMPurify, **and** the media-storage SVG machinery. Cost: must build/maintain a chart component that approximates the IODA Highcharts chart (multiple datasources, axis normalization, styling).
2. **Server-side SVG render** — fetch `signals/raw`, render an SVG on the backend (Highcharts export server or a lightweight renderer), keep the existing `/media` storage + `<img>` path. Removes the full headless browser but keeps server-side rendering. Same chart-reproduction cost as #1.

The trade-off either way: the scrape gets a pixel-perfect chart for free; rendering ourselves means reproducing IODA's chart config and maintaining it as their dashboard evolves.

## Verification (done during investigation)

- Live probe: `GET /v2/signals/raw/country/US?from=…&until=…&maxPoints=20` → **HTTP 200** with `data[]` time-series (datasources: GTR, BGP, ping, Mozilla, transit), `step`/`nativeStep`/`values`.
- Controller enumeration + grep confirming no image/chart endpoint exists.
