# Cloudflare Radar & IODA Source Configuration

This note records **what a user can and cannot configure** for the **Cloudflare Radar**
and **IODA** source types through the Aggie UI, and what it would take to make the missing
knobs configurable. It was written to answer a specific question: *can a user add an ASN to
the Cloudflare feed, or target/exclude a specific region for IODA, through the UI?*

**Short answer: no.** Both source forms expose exactly one data-scoping control — a
"Two-Letter Country Code" dropdown that is hardcoded to a single option, `IR`. There is no
ASN field, no region/location/entity field, and no generic params object on the Source
model to hold one. Everything else (which ASNs, which regions, which query types) is derived
at fetch time from what the upstream API returns, filtered against that one country code.

---

## What the UI exposes

Source forms live in
[CreateEditSourceForm.tsx](../../../src/pages/Settings/source/CreateEditSourceForm.tsx).

**IODA form** (`iodaSchema` + `iodaForm`):
- `nickname` (Feed name)
- `keywords` — rendered as a **FormikDropdown labeled "Two-Letter Country Code"** whose list
  is hardcoded to a single option `[{ _id: "IR", label: "IR" }]`. Schema requires it
  (`keywords: Yup.string().required("Country Code is required")`).
- `credentials` — connection picker
- Access-policy fields
- **No** ASN, location, region, or entity field.

**Cloudflare form** (`cloudflareSchema` + `cloudflareForm`): structurally identical —
`nickname`, the same hardcoded `IR` "Two-Letter Country Code" dropdown bound to `keywords`,
`credentials`, and access policy. **No** ASN/region/location/entity field.

> **Contrast — OONI already does this.** The OONI form exposes an ASN field: `lists`
> rendered as a "Network ASNs" `FormikInput` with per-ASN validation. So the pattern for a
> user-supplied ASN already exists in the codebase — it is just wired only for OONI, not
> Cloudflare/IODA. That wiring is the natural template to copy.

The form `onSubmit` forwards whatever fields the form holds plus `media` and `accessPolicy`;
there is no frontend allowlist. **The only limiter is which inputs the form renders.**

---

## How the requests are actually parameterized

[`backend/fetching/sourceToChannel.js`](../../../backend/fetching/sourceToChannel.js)
`createChannel` maps the Source into the channel's scope. For Cloudflare and IODA the only
geo/entity input mapped is `keywords → countryCode`:

```js
case 'ioda':
    options = { ...options, media, countryCode: keywords, sourceId: _id };
case 'cloudflare':
    options = { ...options, media, countryCode: keywords, credentials, sourceId: _id };
case 'ooni':
    options = { ...options, asns: lists };   // <-- ASN genuinely flows from the Source
```

So the single configurable parameter for Cloudflare/IODA is `source.keywords → countryCode`,
and the UI restricts that to `"IR"`.

**Cloudflare** ([`channels/cloudflare.js`](../../../backend/fetching/channels/cloudflare.js)):
- `this.countryCode = options.countryCode || null` is the only geo/entity input.
- The main poll appends only `dateStart`, `dateEnd`, `limit` — **no `asn` or `location`
  param is sent.** It pulls all traffic anomalies and filters client-side.
- Country filtering happens in-memory: an event is kept only if
  `event.locationDetails?.code === this.countryCode` **or**
  `event.asnDetails?.location?.code === this.countryCode`; everything else is counted as
  `irrelevantRegionReportCount` and skipped.
- ASN is **read out of** each returned event (`as${event.asnDetails.asn}`), never supplied.
  The only place an `asn`/`location` query param is ever added is the reconciliation helper
  `findAnomalyForReport`, and even there the value comes from the stored `rawEvent`.

**IODA** ([`channels/ioda.js`](../../../backend/fetching/channels/ioda.js)):
- `this.countryCode = options.countryCode || null`.
- `this.queryTypes = ['region', 'geoasn-region', 'geoasn-country', 'asn-country']` is
  **hardcoded**.
- `buildEventsUrl` parameterizes requests purely by `queryType` + `this.countryCode`
  (e.g. `relatedTo = country/${this.countryCode}`). No user-supplied region/ASN/entity
  enters the query.
- Region filtering is hardcoded: for `geoasn-region` it applies a fixed regex and drops
  events whose region code isn't in `this.regionCodes`. `regionCodes` is fetched from IODA
  **metadata for that country**, not user-configured.
- ASN values are extracted from returned events, never supplied.

`API_FETCH_INTERVAL` (env) affects poll cadence only. There is no ASN/location/region config
in env or `externalApis.js`.

---

## Source model & controller

[`backend/models/source.js`](../../../backend/models/source.js): the schema is a fixed, flat
set of loosely-typed strings shared across all media types — `media`, `nickname`,
`resource_id`, `url`, `keywords` (String), `regex` (String), `lists` (String), `enabled`,
`events`, `credentials`, `accessPolicy`, etc. There is **no dedicated ASN/region/location
field and no generic `params`/`options`/`config` object.** The de-facto convention is that
`keywords`, `lists`, and `regex` are overloaded per media type — but Cloudflare/IODA read
only `keywords` (→ `countryCode`).

[`sourceController.js`](../../../backend/api/controllers/sourceController.js): `source_create`
passes the entire `req.body` through to `Source.create`, and `source_update` copies every
body key except `_id`/`user`/`events` onto the document. The controller does **not** restrict
fields — unknown keys are simply dropped by the Mongoose schema. **The real gates are the
schema and the channel code, not the controller.**

---

## What it would take to make these configurable

Both changes follow the same shape (the OONI ASN path is the working template):

**Cloudflare ASN**
1. Add an ASN field to the Cloudflare form in `CreateEditSourceForm.tsx` (mirror OONI's
   "Network ASNs" `FormikInput` + validation).
2. Store it on the Source — either a new schema field or by overloading `lists`.
3. Map it in `sourceToChannel.js` (`case 'cloudflare'`), e.g. `asns: lists`.
4. In `cloudflare.js`, send/filter by ASN (add the `asn` query param and/or extend the
   in-memory filter).

**IODA region (target / exclude)**
1. Add a region include/exclude control to the IODA form.
2. Store it on the Source (new field or overload `lists`).
3. Map it in `sourceToChannel.js` (`case 'ioda'`).
4. In `ioda.js`, thread the value through `buildEventsUrl` and the region-filter step
   (currently a hardcoded `queryTypes` list + fixed regex against IODA-metadata region codes).

Optionally, un-hardcode the `IR`-only country dropdown so any two-letter code can be chosen
(the backend already accepts any code; only the frontend dropdown limits it).
