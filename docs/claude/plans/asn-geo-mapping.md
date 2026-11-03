# ASN Geo Mapping: Development Spec

Handoff document for an agent building a system that maps ASN (autonomous system) network data to countries, regions, counties, and cities, and displays it in a React frontend.

Drafted 2026-11-03. Library versions and data licenses change; verify before shipping (see "Verify before building").

---

## 1. Requirements

- **All dependencies must be free.** No paid libraries, no usage-billed APIs, no paid tiers. Free-with-attribution (CC BY, CC BY-SA) and public domain are acceptable.
- **Global coverage.** Must support any country the user might focus on.
- **Single-country focus.** The UI shows one country at a time, not the whole world at once. Load data per country on demand; no world-scale tiling pipeline is needed.
- **Geographic levels:** country (ADM0), region/state/province (ADM1), county/district (ADM2) where data exists, and cities (as points).
- **Backend:** Node.js. **Frontend:** React.

---

## 2. Key concept: an ASN has no single location

A large ISP or mobile carrier announces many IP prefixes spread across many cities, sometimes across multiple countries. Mapping an ASN to geography means:

```
ASN -> announced prefixes -> geolocate each prefix -> aggregate (weighted by address count)
```

Results should be expressed as distributions ("62% of AS12345's address space geolocates to region X"), not a single location.

If source data includes actual IP addresses (not just ASNs), geolocate the IPs directly. That is far more accurate than inferring from an ASN's footprint.

---

## 3. Approved stack

### Backend (Node)

| Package | Purpose | License |
|---|---|---|
| `maxmind` | Read MMDB files (DB-IP Lite, IPinfo Lite, GeoLite2). Use `getWithPrefixLength()` to get the matched network size. | MIT |
| `mmdb-lib` | Environment-agnostic MMDB reader (used by `maxmind`; works in browser) | MIT |
| `cidr-tools` | Prefix math: address counts, merging overlapping prefixes | BSD-2 |
| `ipaddr.js` | IP parsing and validation | MIT |
| `which-polygon` | Fast bulk point-in-polygon for ADM2 assignment | ISC |
| `@turf/boolean-point-in-polygon` | Alternative point-in-polygon (simpler, slower for bulk) | MIT |

### Frontend (React)

| Package | Purpose | Notes |
|---|---|---|
| `react-map-gl` + `maplibre-gl` | Interactive map with basemap | Import from `react-map-gl/maplibre`. Never use the Mapbox entry point (usage-billed). |
| `@vnedyalk0v/react19-simple-maps` | SVG choropleth without basemap | React 19+ fork of the unmaintained `react-simple-maps`. |
| `@visx/geo` | Alternative SVG choropleth | Fit projection with `geoMercator().fitSize()`. |

> **Aggie compatibility note (added 2026-11-03).** Aggie's frontend is locked to React 17 by `react-scripts` 5 (see CLAUDE.md and `FRONTEND.md`), so check each package's `react` peer range before adding it. As of this date, per `npm view <pkg> peerDependencies`:
>
> - `@vnedyalk0v/react19-simple-maps` needs React `>=19`. **Not usable in Aggie.**
> - `react-simple-maps` (5.0.5) supports React 16.8 through 19, and it had new releases in September 2026, so the "unmaintained" note above is out of date. Use it in place of the React 19 fork.
> - `@visx/geo` 4.x needs React 18+. Pin to `@visx/geo@^3` (3.12.0 supports React 16.3 through 18).
> - `react-map-gl` (8.x and 7.x) supports React `>=16.3`, so it works with React 17. `react-map-gl@7.1.9` caps `maplibre-gl` at `<5`; 8.x does not. Confirm that the `react-map-gl/maplibre` entry point and `maplibre-gl` build under CRA 5 / webpack 5 before committing to the basemap option.

### Basemap tiles (only if using MapLibre)

- **OpenFreeMap**: free hosted vector tiles, no API key. https://openfreemap.org
- **Protomaps**: self-host a PMTiles file from static storage. https://protomaps.com

### Excluded (do not add)

- Mapbox GL JS (usage-billed)
- amCharts, Highcharts Maps (commercial licenses)
- MaxMind paid web services / GeoIP2 paid databases
- GADM boundaries (non-commercial license)

---

## 4. Data sources

### ASN to prefixes

| Source | Use | Cost / license |
|---|---|---|
| RIPEstat `announced-prefixes` | Prefixes announced by an ASN | Free, no auth. Respect fair-use rate limits; cache results. |
| RIPEstat `maxmind-geo-lite-announced-by-as` | One-call ASN to city locations with coverage percentages | Free, no auth. Good for prototyping. Data is GeoLite2-derived, so MaxMind's terms apply. |

Endpoints:
```
https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS3333
https://stat.ripe.net/data/maxmind-geo-lite-announced-by-as/data.json?resource=AS3333
```

### Prefix / IP geolocation

| Source | Granularity | License | Notes |
|---|---|---|---|
| **DB-IP Lite City** (primary) | City, region, lat/lng | CC BY 4.0 | Simplest license among city-level options. MMDB format. Monthly updates. https://db-ip.com/db/lite.php |
| **IPinfo Lite** (cross-check) | Country + ASN | CC BY-SA 4.0 | Commercial use allowed with attribution. Share-alike applies if redistributing derived data. MMDB format. https://ipinfo.io/lite |
| IP2Location LITE (optional) | City, region | CC BY-SA 4.0 | Alternative city-level source. |
| MaxMind GeoLite2 City + ASN (optional) | City, ISO 3166-2 subdivision, lat/lng, accuracy radius | Free account, custom EULA | Read the EULA (attribution and update obligations) before using. |

### Boundaries and places

| Source | Levels | License | Notes |
|---|---|---|---|
| **geoBoundaries** (primary) | ADM0, ADM1 for all countries; ADM2 for most | CC BY 4.0 | Per-country files. API pattern: `https://www.geoboundaries.org/api/current/gbOpen/{ISO3}/{ADM_LEVEL}/` returns metadata with download URLs. |
| Natural Earth | ADM0, ADM1, populated places | Public domain | Has "point of view" variants for disputed borders. |
| GeoNames | Cities and towns as points (very deep) | CC BY 4.0 | Use for city-level points beyond major cities. |

### Supplementary context

| Source | Meaning | License |
|---|---|---|
| PeeringDB | Where a network physically interconnects (facilities, IXPs by city) | Free API; check AUP for bulk use |
| RIR delegation files / CAIDA AS2Org | Where an ASN is registered | Free. Registration country is not operating location; use only as a sanity check. |

---

## 5. Pipeline

1. **Fetch prefixes** for each ASN from RIPEstat `announced-prefixes`. Cache (announcements change slowly; refresh daily or weekly).
2. **Normalize prefixes** with `cidr-tools`: merge overlaps so address space isn't double counted.
3. **Geolocate** each prefix with `maxmind` against DB-IP Lite City. Record matched prefix length from `getWithPrefixLength()`.
4. **Country:** take directly from the record. Optionally cross-check against IPinfo Lite and flag disagreements.
5. **Region (ADM1):** use the subdivision ISO 3166-2 code from the record. Join to geoBoundaries ADM1 via its `shapeISO` property. Verify join coverage per country; some countries' codes won't match and need a lat/lng point-in-polygon fallback.
6. **County (ADM2):** run lat/lng through `which-polygon` against that country's ADM2 GeoJSON. Only do this when accuracy is sufficient (see caveats).
7. **City:** keep as points (name + lat/lng). Do not attempt city polygons; global city boundary data is inconsistent.
8. **Weight** every assignment by address count (a /16 outweighs a dozen /24s). Track IPv4 and IPv6 separately; IPv6 address counts dwarf IPv4 and will distort combined weights.
9. **Output** per-ASN distributions at each level, keyed by ISO 3166-1 alpha-3 (country), ISO 3166-2 or geoBoundaries `shapeID` (ADM1/ADM2).

---

## 6. Frontend flow

1. User selects a country.
2. Fetch that country's ADM1 GeoJSON (and ADM2 if it exists) from geoBoundaries, or from self-hosted copies.
3. Fetch the backend's aggregated metrics for that country.
4. Join metrics to features by ID and render a choropleth.
5. Render cities as point markers.

Implementation notes:
- **Don't hardcode admin depth.** Check which levels exist per country and let drill-down stop where data stops. Microstates (Monaco, Vatican City) have no meaningful subdivisions.
- **Simplify large geometries** (US counties, Brazil municipalities can be several MB) with mapshaper once at build time, then self-host the results.
- With MapLibre, use `feature-state` to update choropleth colors without reloading geometry.

---

## 7. Accuracy caveats

- **Filter by accuracy before going below ADM1.** Many geolocation records sit at a city or country centroid with large uncertainty. Assigning those to a county produces confident-looking wrong answers. Where the source provides an accuracy radius, set a threshold; where it doesn't, treat sub-region assignment as low confidence.
- **Mobile carriers and CGNAT** often geolocate to a few gateway cities, making nationwide networks appear concentrated in major cities.
- **HQ bias:** smaller ISPs and hosting providers often geolocate to their headquarters rather than their users.
- **Free databases are less accurate** than paid ones at city level. Country level is reliable; region is usually reasonable; city and county should be presented with confidence indicators.
- **Disputed territories** (e.g. Kashmir, Crimea, Western Sahara, Taiwan): different datasets encode different points of view. Choose deliberately and document the choice; mismatches between the geolocation DB and the boundary dataset will break joins.

---

## 8. Attribution (required in UI)

Display attribution for every CC BY / CC BY-SA source used, for example:

> IP geolocation by DB-IP (db-ip.com), CC BY 4.0. Boundaries from geoBoundaries, CC BY 4.0. Country/ASN data by IPinfo, CC BY-SA 4.0. Routing data from RIPEstat. Basemap © OpenStreetMap contributors, OpenFreeMap.

Adjust to the sources actually shipped. If publishing a derived dataset (not just a visualization) built from IPinfo Lite or IP2Location LITE, it must be released under CC BY-SA.

---

## 9. Verify before building

- Current versions and maintenance status of each npm package listed.
- Current license terms for DB-IP Lite, IPinfo Lite, and GeoLite2 (if used).
- RIPEstat rate limits and any `sourceapp` parameter expectations.
- geoBoundaries API path format and which ADM levels exist for target countries.
- OpenFreeMap availability and usage terms.

---

## 10. Open decisions

- Basemap vs basemap-free rendering (MapLibre vs SVG choropleth).
- Whether to use GeoLite2 as an additional source (adds account and EULA overhead).
- Accuracy threshold for ADM2 assignment.
- Disputed-border point of view.
- Refresh cadence for prefix and geolocation data.
