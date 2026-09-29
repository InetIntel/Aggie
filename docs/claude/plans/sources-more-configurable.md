# Make the Sources (Feeds) page more configurable

> Note: per project preference, on approval this plan should live at `docs/claude/plans/`. It was written here because plan mode only permits editing this file.

## Context

Today every per-source setting is crammed into three overloaded string fields on the `Source` model — `keywords`, `regex`, `lists` — and each media type assigns its own meaning to those slots. Mastodon is the one fully-configurable example: its mode/keyword/hashtag/scope all flow from those fields into the API request, and because the fetching process tears down and rebuilds a channel on **every** source save (`backend/fetching/listeners/source.js:27` → `disableChannel`/`deleteChannel`/`createChannel`/`enableChannel`), edits take effect live with no restart.

The other geo/outage sources are under-configurable, with several values hardcoded in the channel classes:

- **Cloudflare** — collects *all* traffic anomalies in a 6h window and keeps those whose location **or** ASN-location matches one country (`keywords` → `countryCode`). The country dropdown in the UI is hardcoded to a single option `IR`. There is no ASN concept the user can see.
- **OONI** — ASNs are editable (`lists`), but `probe_cc='IR'`, `test_name='web_connectivity'`, and the ~50-domain watch list (`backend/fetching/config/ooni.json`) are all hardcoded and never wired to the Source.
- **IODA** — country is editable (`keywords`) but the UI dropdown is hardcoded to `IR`; there is no way to narrow to a specific ASN or region.

Goal: bring every source up to the Mastodon standard of "change it whenever you want in the UI," and specifically expose Cloudflare observed-ASN visibility, OONI test/country/domains, and IODA country/ASN/region.

## Decisions (confirmed with user)

- **Storage:** add new **typed** fields to the `Source` schema alongside the existing `keywords`/`lists`/`regex` (no migration, no reuse of the overloaded strings for the new structured data). Existing sources keep working unchanged.
- **Cloudflare ASN:** **display observed ASNs only** (read-only). No collection/filter change — derive the list from existing reports.
- **OONI:** make **country, test, and domains** editable (ASNs already are).
- **Delivery:** one comprehensive plan, implemented in the phases below.

## Approach

Reuse the Mastodon pattern end-to-end: store the tunable value on the Source doc → read it in the channel constructor → pass it into the API request/filter. The `source:save` rebuild loop already makes edits live, so no new runtime plumbing is needed.

### Phase 1 — Schema foundation (`backend/models/source.js`)

Add optional, default-empty typed fields (keep `keywords`/`lists`/`regex` as-is):

```js
asns:          { type: [Number], default: [] },   // IODA ASN filter
region:        { type: String },                   // IODA region filter (optional)
ooniTestName:  { type: String },                   // OONI test (default handled in channel)
ooniDomains:   { type: [String], default: [] },    // OONI watched domains
ooniUseAllDomains: { type: Boolean, default: false },
```

Country stays on `keywords` for ioda/cloudflare/**and now ooni** (OONI currently ignores `keywords` and uses a `PROBE_CC` constant; we route `keywords` → probe country with a fallback to `'IR'` so existing OONI sources are unaffected). No migration required — every new field is optional and empty means "current behavior."

`source_create`/`source_update` (`backend/api/controllers/sourceController.js:41`, `:167`) already copy the whole request body onto the doc, so the new fields persist with no controller change. Add light server-side validation (positive-integer ASNs, known test name) mirroring the existing OONI ASN parse.

### Phase 2 — Wire config into channels

**`backend/fetching/sourceToChannel.js`** (`switch (media)` at `:110`) — pass the new options:

- `ooni` (`:233`): `{ asns: lists, probeCC: keywords, testName: source.ooniTestName, domainConfig: { useAllDomains: source.ooniUseAllDomains, domains: source.ooniDomains } }`
- `ioda` (`:214`): add `asns: source.asns, region: source.region` alongside existing `countryCode: keywords`
- `cloudflare` (`:223`): unchanged (display-only feature needs no channel change)

**`backend/fetching/channels/ooni.js`**:
- Replace the `PROBE_CC` constant with `this.probeCC = options.probeCC || 'IR'` and thread it through `fetch()`, `parse()` (`searchParams.probe_cc`, `raw.probeCC`), and `outageFields`.
- Replace the hardcoded `test_name: 'web_connectivity'` with `this.testName = options.testName || 'web_connectivity'` in `parse()` and `raw.testName`, and pass it into `hasMeasurements` (verify/extend `backend/fetching/ooniApi.js` to accept `test_name`; it currently assumes web_connectivity).
- Domains already flow via `options.domainConfig` (`ooni.js:86`); the only change is that `sourceToChannel` now supplies it from the Source instead of always falling back to `config/ooni.json`. Keep the JSON as the default when the source sets nothing.
- `NETWORK_NAMES` stays a best-effort friendly-name map with the existing `AS<n>` fallback.

**`backend/fetching/channels/ioda.js`**:
- Constructor: `this.asns = (options.asns || []).map(Number)`, `this.region = options.region || null`.
- In `fetch()` after `parseEvent` produces a post, drop events that don't match when a filter is set: compare `post.asn` (normalized `as<n>`) against `this.asns`, and region against `this.region` (region-scoped queryTypes already carry region info via `this.regionCodes`). Keep pulling all four `queryTypes` and filter in-memory — simplest and matches "monitor a specific ASN in an upstream country." Empty filters = current behavior.

### Phase 3 — Cloudflare "observed ASNs" (read-only)

No channel change. Cloudflare reports already store `asn` (e.g. `as13335`), `geoScope`, `isAsnScoped`, `raw.entityName`, and `_sources`.

- Add `GET /api/source/:id/observed-asns` (`backend/api/routes/sourceRoutes.js` + a `sourceController` handler): aggregate `Report` where `_sources` contains the id and `isAsnScoped: true`, grouping by `asn` → `{ asn, name (from raw.entityName), count, lastSeen }`, over a recent window (e.g. last 30 days), sorted by count. Reuse the existing ASN name API (`src/api/asn`, `GET /api/asn/bulk`) on the frontend if richer names are wanted.

### Phase 4 — Frontend forms & display

**`src/api/sources/types.ts`** — extend `Source` and `EditableSource` with the optional fields: `asns?: number[]`, `region?: string`, `ooniTestName?: string`, `ooniDomains?: string[]`, `ooniUseAllDomains?: boolean`. (`newSource`/`editSource` are typed `any`, so no request-shape blocker.)

**`src/pages/Settings/source/CreateEditSourceForm.tsx`** — each media form is a JSX constant with its own Yup schema; follow the Mastodon nested-conditional pattern (`MastodonConditionalFields` `:181`, conditional Yup `.when(...)` `:714`, submit scrub `:753`):

- **Country dropdown (IODA `:594`, Cloudflare `:640`, and new for OONI):** replace the hardcoded `[{ _id: "IR", label: "IR" }]` with a real country list. Add a small `src/pages/Settings/source/countryOptions.ts` helper built from `i18n-iso-countries` (already a backend dep; add to frontend if not present) producing `{ _id: code, label: name }[]`, fed to the existing `FormikDropdown`.
- **IODA:** add an optional **ASN** multi-select (`FormikMultiCombobox`, backed by the `asns` array, populated via `getAllAsns()` from `src/api/asn`) and an optional **Region** field (`FormikDropdown` from `regionCodes`, or `FormikInput` if a live region list isn't readily available).
- **OONI:** add a **Country** dropdown (`keywords`), a **Test** dropdown (`ooniTestName`, from a small supported-tests list constant), a **Domains** editor (`FormikMultiCombobox` or the chip-input pattern of `MastodonHashtagField`, backed by `ooniDomains`), and an **"observe all domains"** toggle (`FormikSwitch` → `ooniUseAllDomains`). Keep the existing ASN input.
- **Cloudflare:** unlock the country dropdown; add a **read-only "Observed ASNs"** panel (edit/details view only) that calls the new `/observed-asns` endpoint and lists ASN + name + count. This is display, not a form field.

**`src/pages/Settings/source/sourceDisplay.tsx`** — add read-only rows in `getSourceConfigRows` (`:66`) for the new values (resolved country name, ASNs, region, OONI test, domains / "all domains") so the details view mirrors the form.

## Key files

- `backend/models/source.js` — new typed fields
- `backend/fetching/sourceToChannel.js` — pass new options (`:110` switch)
- `backend/fetching/channels/ooni.js` — probeCC/testName/domains from source
- `backend/fetching/channels/ioda.js` — ASN/region filtering
- `backend/fetching/ooniApi.js` — accept `test_name` (verify)
- `backend/api/controllers/sourceController.js` + `routes/sourceRoutes.js` — `/observed-asns`, optional validation
- `src/api/sources/types.ts` — extend `Source`/`EditableSource`
- `src/pages/Settings/source/CreateEditSourceForm.tsx` — per-media form fields
- `src/pages/Settings/source/sourceDisplay.tsx` — read-only rows
- `src/pages/Settings/source/countryOptions.ts` — new country-list helper

## Reuse (don't rebuild)

- `FormikDropdown` (single-select), `FormikMultiCombobox` (searchable multi-select → array field), `FormikSwitch`, `FormikInput`, `MastodonHashtagField` (string-backed chip input) — all in `src/components/`.
- ASN API: `getAllAsns()` / `getAsnsByIds()` in `src/api/asn/index.ts`.
- `i18n-iso-countries` (already used in the channels) for country code→name.
- The `source:save` → channel-rebuild loop (`listeners/source.js`) — no new runtime wiring needed.

## Verification (no test runner configured; manual)

1. `npm run dev`; open `https://localhost:8000` → Settings → Feeds.
2. **Live-edit sanity (Mastodon parity):** edit an existing source's config, save, and confirm the fetching process logs a channel rebuild (`[Fetching-createChannel] Success`) — proving edits apply without restart.
3. **IODA:** create/edit an IODA source, pick a country (not IR), set an ASN and/or region filter; confirm new reports are scoped to that country and only the configured ASN/region appear. Clear the filters and confirm country-wide behavior returns.
4. **OONI:** set a non-IR country, a different test, a custom domain list + toggle "observe all domains"; confirm `probe_cc`/`test_name` in the generated OONI Explorer URL and that reports reflect the chosen domains.
5. **Cloudflare:** open a Cloudflare source's details; confirm the "Observed ASNs" panel lists ASNs from recent reports with counts; change the country and confirm collection follows.
6. **Regression:** confirm pre-existing sources (empty new fields) behave exactly as before, and that the details view (`sourceDisplay`) renders the new rows.
7. Optional: a throwaway script under `scratchpad/` to hit `/api/source/:id/observed-asns` and eyeball the aggregation.
