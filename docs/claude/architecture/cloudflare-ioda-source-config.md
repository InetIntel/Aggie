# IODA, Cloudflare & OONI source configuration

This note records **what a user can configure** for the three outage/geo source types —
**IODA**, **Cloudflare Radar**, and **OONI** — through the Aggie UI, and how those
settings flow into the fetching channels.

Historically these sources were barely configurable: both the IODA and Cloudflare forms
exposed a single "Two-Letter Country Code" dropdown hardcoded to `IR`, with no ASN,
region, test, or domain controls, and several values baked into the channel classes.
That was reworked in the "make sources configurable" feature (commit `49e44b97`): the
`Source` schema gained typed per-media fields, the forms expose real controls, and the
channels read the configured values. Because the fetching process tears down and
rebuilds a channel on **every** source save
([backend/fetching/listeners/source.js](../../../backend/fetching/listeners/source.js)),
edits take effect live with no restart — the same pattern Mastodon already used.

---

## Source schema

Configuration lives on the `Source` document
([backend/models/source.js:30-72](../../../backend/models/source.js#L30-L72)). The
legacy overloaded strings remain (`keywords`, `regex`, `lists`), and structured typed
fields were added **alongside** them. Every new field is optional and empty means
"current/default behavior", so pre-existing sources are unaffected (no migration):

```js
asns:              { type: [Number], default: [] },   // IODA: narrow outages to these ASNs
region:            { type: String },                   // IODA: narrow outages to this region code
ooniTestName:      { type: String },                   // OONI: measurement test (default web_connectivity)
ooniDomains:       { type: [String], default: [] },    // OONI: watched domains
ooniUseAllDomains: { type: Boolean, default: false },  // OONI: watch all domains instead of the list
```

**Country** stays on `keywords` for all three source types (IODA / Cloudflare / OONI).
`source_create` passes the whole request body through and `source_update` copies every
body key except `_id`/`user`/`events`, so new fields persist with no controller change;
unknown keys are dropped by the schema.

> **ASN storage is still split.** IODA stores ASNs in the typed `asns: [Number]` array,
> but **OONI still stores its ASNs in the legacy `lists` comma-string** (see the channel
> wiring below). Unifying OONI onto the typed `asns` array is a pending follow-up —
> [`../plans/ooni-asns-typed-array-migration.md`](../plans/ooni-asns-typed-array-migration.md).
> Do not assume OONI reads `source.asns`.

> **Feed sources can have no creator.** IODA / Cloudflare / OONI sources may be created
> without a user, so `Source.user` is nullable (`required: false`,
> [source.js:52](../../../backend/models/source.js#L52)) and the read side populates it
> to `null`. UI that renders the creator must guard against a null `user`.

---

## How config reaches the channels

[`backend/fetching/sourceToChannel.js`](../../../backend/fetching/sourceToChannel.js)
`createChannel` maps each Source into its channel's options
([the `switch (media)`](../../../backend/fetching/sourceToChannel.js#L214-L254)):

```js
case 'ioda':
    options = { ...options, media, countryCode: keywords,
                asns: source.asns, region: source.region, sourceId: _id };
case 'cloudflare':
    options = { ...options, media, countryCode: keywords, credentials, sourceId: _id };
case 'ooni':
    options = { ...options, asns: lists,               // <-- legacy string, not source.asns
                probeCC: keywords, testName: source.ooniTestName,
                domainConfig: /* {useAllDomains, domains} when set, else undefined */ };
```

- **IODA** ([channels/ioda.js](../../../backend/fetching/channels/ioda.js)) — reads
  `countryCode`, plus the optional `asns` and `region` filters. It still pulls all four
  `queryTypes` and filters returned events in-memory; empty `asns`/`region` = country-wide
  behavior.
- **Cloudflare** ([channels/cloudflare.js](../../../backend/fetching/channels/cloudflare.js))
  — reads only `countryCode`. It collects all traffic anomalies in the window and keeps
  those whose location or ASN-location matches the country; ASNs are **read out of** the
  returned events, never supplied. There is no ASN/region *filter* input (see "Observed
  ASNs" below for the read-only visibility feature).
- **OONI** ([channels/ooni.js](../../../backend/fetching/channels/ooni.js)) — reads
  `probeCC` (country, defaulting to `IR`), `testName` (default `web_connectivity`), the
  ASN list (from the legacy `lists` string), and `domainConfig`. When the source sets no
  domains, `domainConfig` is left `undefined` and the channel falls back to
  [config/ooni.json](../../../backend/fetching/config/ooni.json).

---

## What the UI exposes

Source forms live in
[CreateEditSourceForm.tsx](../../../src/pages/Settings/source/CreateEditSourceForm.tsx),
with read-only rows mirrored in
[sourceDisplay.tsx](../../../src/pages/Settings/source/sourceDisplay.tsx).

- **Country** — the previously `IR`-only dropdown is now a real country list from
  [countryOptions.ts](../../../src/pages/Settings/source/countryOptions.ts) (built from
  `i18n-iso-countries`), bound to `keywords`, on the IODA, Cloudflare, and OONI forms.
- **IODA** — optional **ASN** input (typed `asns` array via `AsnChipInput`
  `format="array"`) and an optional **Region** input.
- **OONI** — a **Test** dropdown (`ooniTestName`), a **Domains** editor + an "observe all
  domains" toggle (`ooniUseAllDomains`), and the existing **ASN** input (still bound to
  `lists` — see the storage caveat above).
- **Cloudflare** — the country dropdown plus a read-only **Observed ASNs** panel; no ASN
  or region *filter* input.

The form `onSubmit` forwards whatever fields it holds; the real gates are the schema and
the channel code, not a frontend allowlist.

---

## Cloudflare "Observed ASNs" (read-only)

Because Cloudflare collection is country-wide and the ASNs seen aren't a configured
input, the feed details view shows which ASNs a source has actually produced reports for
recently. `GET /api/source/:_id/observed-asns`
([sourceRoutes.js:17](../../../backend/api/routes/sourceRoutes.js#L17) →
`source_observed_asns`,
[sourceController.js:176-228](../../../backend/api/controllers/sourceController.js#L176-L228))
aggregates `Report` documents where `_sources` contains the id, `isAsnScoped: true`, over
a recent window, grouping by `asn` → `{ asn, count, lastSeen, geoScope }`, sorted by
count. It is visibility only — it changes nothing about collection.
