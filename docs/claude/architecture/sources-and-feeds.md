# Sources and Feeds settings page

This note covers the **Sources and Feeds** settings page (`/settings/connections`): how it
groups connections (credentials) and feeds (sources) by provider, the terminology it uses,
and what a user can configure per feed. It also records how the outage/geo feeds (IODA,
Cloudflare Radar, OONI) map their settings onto the fetching channels.

---

## Terminology

The page's visible copy uses three terms (see the intro paragraph in
[ConnectionsIndex.tsx](../../../src/pages/Settings/Connections/ConnectionsIndex.tsx)):

| UI term | Meaning | Backend |
| --- | --- | --- |
| **Source** | A platform Aggie pulls from (Mastodon, IODA, ...) | the `type` / `media` identifier, e.g. `telegramUser` |
| **Connection** | The login or API key that lets Aggie reach a Source | `Credentials` model |
| **Feed** | A collector running on a Connection; its items show up as Alerts | `Source` model |

**"Source" is overloaded.** On this page a "Source" is a *platform*, while the backend
`Source` model (and the separate "Sources" nav item some roles see) is a *feed*. The page
was previously labeled "Providers and Feeds"; only the visible copy was renamed. Routes,
folder/component names, and code identifiers (`providerLabel`, `PROVIDER_LABELS`,
`ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER`) still say "provider", and that is expected.

Display names for each type come from `PROVIDER_LABELS` / `providerLabel()` in
[src/api/common.ts](../../../src/api/common.ts) (`telegramUser` → "Telegram", `ioda` →
"IODA", ...). Use `providerLabel()` anywhere a raw type identifier would otherwise reach
the UI.

---

## Page structure

### Routing and access

- `/settings/connections` → `ConnectionsIndex`. The route only exists for `admin` and
  `team_lead` roles ([AppRouter.tsx](../../../src/AppRouter.tsx)), and the "Sources and
  Feeds" nav link for those roles points there
  ([Settings/index.tsx](../../../src/pages/Settings/index.tsx)).
- `monitor` / `viewer` roles get the older flat `/settings/sources` page (`SourcesIndex`)
  instead; their nav link is labeled "Sources and Feeds" (or "Sources" for team leads).
- `/settings/credentials` (`CredentialsIndex`) is still routed for admins/team leads but
  has no nav link. It is a leftover from before the grouped page.
- Within the page, controls are gated by session permissions: `change settings` shows the
  global **Enable Fetching** toggle (`<Configuration />`) and the connection controls;
  `manage sources` shows the feed add/edit controls.

### One card per provider

[ConnectionsIndex.tsx](../../../src/pages/Settings/Connections/ConnectionsIndex.tsx)
fetches `["sources"]`, `["credentials"]`, and `["session"]` once and maps
`CREDENTIAL_OPTIONS` ([src/api/common.ts](../../../src/api/common.ts): `junkipedia`,
`telegramUser`, `mastodon`, `ioda`, `cloudflare`, `ooni`; `telegramBot` is commented out)
to one
[ApiTypeSection](../../../src/pages/Settings/Connections/ApiTypeSection.tsx) each. A
section filters to `credential.type === type` and `source.media === type` (same lowercase
identifiers) and contains:

- **Header**: the provider label and a green **"Connect {provider}"** button
  (`AggieButton variant="primary"`) that opens `CreateCredentialForm lockedType={type}`.
- **Connections**: the provider's credentials as colored pills (see
  [Connection pill palette](#connection-pill-palette)) with edit/delete.
- **Feeds**: grouped by feed-type label (`feedTypeLabel`), groups alphabetical, feeds
  sorted by nickname. Each row shows the feed name (opens `SourceDetailsView`), its
  connection pill, an access-mode pill (green Public / orange restricted or
  public-until), a warnings badge, an enable toggle, and an edit/delete menu.
- A teal **"Add feed"** button (`AggieButton variant="teal"`, backed by the
  `aggie.secondary.650` token in `tailwind.config.js`) that opens
  `CreateEditSourceForm defaultType={type}`, so a new feed is pre-scoped to the section's
  provider and the provider picker is locked.

The `["sources"]` and `["credentials"]` query caches are shared, so adding or renaming a
connection immediately refreshes the feed form's connection dropdown and the feed rows.

---

## Connections (credentials)

- **The connection name is only a label.** A feed links to its credential by **ObjectId**
  (`Source.credentials: ObjectId ref 'Credentials'`,
  [backend/models/source.js](../../../backend/models/source.js)) and channels resolve it
  with `populate('credentials')`. `Credentials.name` is required but **not unique**
  ([backend/models/credentials.js](../../../backend/models/credentials.js)).
- **Auto-generated, editable default.**
  [CreateCredentialForm.tsx](../../../src/pages/Settings/Credentials/CreateCredentialForm.tsx)
  pre-fills "Connection name" with `` `${type} #${countOfThatType + 1}` `` (e.g.
  `mastodon #2`), including for the Telegram and Mastodon OAuth flows. The user can
  overwrite it; an emptied field fails Yup validation.
- **Server-side fallback.** `credential_create` in
  [credentialsController.js](../../../backend/api/controllers/credentialsController.js)
  generates the same `` `${type} #${count + 1}` `` name when the request omits `name`, so
  the field is effectively optional over the API.
- **Multiple per provider.** Nothing limits a provider to one connection.
  `ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER` (`true`) in `src/api/common.ts` is kept so a
  one-per-provider cap can be re-enabled. The per-browser toggle for it is commented out
  in `ConnectionsIndex.tsx`, and the page hardcodes `allowMultipleConnections = true`.
  When the cap is on, the "Connect" button hides once a connection exists, and the feed
  form hides its connection dropdown and auto-selects the only connection.

### Connection pill palette

Each connection renders as a colored pill. The color is assigned purely by a connection's
**position within its provider** (connections sorted by `_id`, so roughly by creation
order), so it carries **no status meaning** and looks the same across providers, both in
the Connections list and on every feed row. The palette is a fixed set of five
accessible light-bg / dark-text pairs, `CONNECTION_COLORS` in
[ApiTypeSection.tsx](../../../src/pages/Settings/Connections/ApiTypeSection.tsx):
**teal → sky → indigo → violet → slate**. It cycles if a provider has more connections
than entries. No other file references these colors.

**Reserved hue families: do not use for connection pills.** Across the app, color carries
meaning: **red / pink / rose = error & danger**, **orange / amber = warning**. A
non-status decorative pill in those families reads to users like an alert, so the palette
is kept to cool/neutral hues. (An earlier palette had a rose slot and an amber slot that
collided with the error and warning UI; those were removed.)

---

## Feeds (sources)

Feed forms live in
[CreateEditSourceForm.tsx](../../../src/pages/Settings/source/CreateEditSourceForm.tsx),
with one subform per provider and read-only rows mirrored in
[sourceDisplay.tsx](../../../src/pages/Settings/source/sourceDisplay.tsx). The form
`onSubmit` forwards whatever fields it holds. `source_create` passes the whole body
through and `source_update` copies every key except `_id` / `user` / `events`, so the real
gates are the Mongoose schema (unknown keys are dropped) and the channel code, not a
frontend allowlist.

Saving a feed tears down and rebuilds its channel in the fetching process
([backend/fetching/listeners/source.js](../../../backend/fetching/listeners/source.js)),
so edits take effect live with no restart.

Fields shared by every subform:

- **Feed name**: the `nickname` field (`SourceNameField`). It is only a display label and
  does not affect fetching. The label, placeholder, and hint spell this out because users
  used to confuse it with the account/handle, the connection, or the provider.
- **Connection**: `CredentialPickerField`, a dropdown of this provider's credentials that
  defaults to the first one. There is no inline "add connection" here; connections are
  created from the section header.
- **Access policy**: `SourceAccessPolicyFields` (Public / Restricted to teams / Public
  until cutoff, plus a team checklist) is mounted on every active subform.

### Mastodon: multiple hashtags

A hashtag-mode Mastodon feed can track several tags. The form's `MastodonHashtagField`
chip input stores them in `lists` as a comma-separated string (no schema change).
[channels/mastodon.js](../../../backend/fetching/channels/mastodon.js) splits that string
into a deduped list of bare tags, makes one tag-timeline request per tag, and dedups the
merged results by status id so a post carrying several tracked tags is enqueued once.

---

## Outage feeds: IODA, Cloudflare, OONI

These three feed types started with a single "Two-Letter Country Code" dropdown hardcoded
to `IR`. The "make sources configurable" feature (commit `49e44b97`) added typed schema
fields, real form controls, and channel support for them.

### Schema

Configuration lives on the `Source` document
([backend/models/source.js](../../../backend/models/source.js)). The legacy overloaded
strings remain (`keywords`, `regex`, `lists`), and typed fields were added **alongside**
them. Every typed field is optional and empty means "default behavior", so older feeds
need no migration:

```js
asns:              { type: [Number], default: [] },   // IODA: narrow outages to these ASNs
region:            { type: String },                   // IODA: narrow outages to this region code
ooniTestName:      { type: String },                   // OONI: measurement test (default web_connectivity)
ooniDomains:       { type: [String], default: [] },    // OONI: watched domains
ooniUseAllDomains: { type: Boolean, default: false },  // OONI: watch all domains instead of the list
```

**Country** is stored in `keywords` for all three types.

> **ASN storage is still split.** IODA stores ASNs in the typed `asns: [Number]` array,
> but **OONI still stores its ASNs in the legacy `lists` comma-string** (see the channel
> wiring below). Unifying OONI onto the typed `asns` array is a pending follow-up:
> [`../plans/ooni-asns-typed-array-migration.md`](../plans/ooni-asns-typed-array-migration.md).
> Do not assume OONI reads `source.asns`.

> **Feed sources can have no creator.** IODA / Cloudflare / OONI feeds may be created
> without a user, so `Source.user` is nullable (`required: false`) and the read side
> populates it to `null`. UI that renders the creator must guard against a null `user`.

### How config reaches the channels

`createChannel` in
[backend/fetching/sourceToChannel.js](../../../backend/fetching/sourceToChannel.js) maps
each Source into its channel's options (the `switch (media)`):

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

- **IODA** ([channels/ioda.js](../../../backend/fetching/channels/ioda.js)) reads
  `countryCode` plus the optional `asns` and `region` filters. It still pulls all four
  `queryTypes` and filters returned events in memory; empty `asns` / `region` means
  country-wide.
- **Cloudflare** ([channels/cloudflare.js](../../../backend/fetching/channels/cloudflare.js))
  reads only `countryCode`. It collects all traffic anomalies in the window and keeps
  those whose location or ASN-location matches the country. ASNs are **read out of** the
  returned events, never supplied; there is no ASN/region *filter* input (see "Observed
  ASNs" below).
- **OONI** ([channels/ooni.js](../../../backend/fetching/channels/ooni.js)) reads
  `probeCC` (country, defaulting to `IR`), `testName` (default `web_connectivity`), the
  ASN list (from the legacy `lists` string), and `domainConfig`. When the feed sets no
  domains, `domainConfig` is `undefined` and the channel falls back to
  [config/ooni.json](../../../backend/fetching/config/ooni.json).

### What the UI exposes

- **Country**: a full country list from
  [countryOptions.ts](../../../src/pages/Settings/source/countryOptions.ts) (built from
  `i18n-iso-countries`), bound to `keywords`, on all three forms.
- **IODA**: optional **ASN** input (`AsnChipInput format="array"`, typed `asns`) and an
  optional **Region** input.
- **OONI**: a **Test** dropdown (`ooniTestName`), a **Domains** chip editor plus an
  "observe all domains" toggle (`ooniUseAllDomains`), and an **ASN** input (still bound to
  `lists`; see the storage caveat above).
- **Cloudflare**: the country dropdown, plus a read-only **Observed ASNs** panel when
  editing an existing feed. No ASN or region filter input.

### Cloudflare "Observed ASNs" (read-only)

Because Cloudflare collection is country-wide and ASNs aren't a configured input, the
Cloudflare edit form shows which ASNs the feed has actually produced reports for
recently (`ObservedAsnsPanel`). `GET /api/source/:_id/observed-asns`
([sourceRoutes.js](../../../backend/api/routes/sourceRoutes.js) →
`source_observed_asns` in
[sourceController.js](../../../backend/api/controllers/sourceController.js)) aggregates
`Report` documents where `_sources` contains the id and `isAsnScoped: true` over the last
30 days (`OBSERVED_ASN_WINDOW_MS`), grouping by `asn` into
`{ asn, count, lastSeen, geoScope }` sorted by count. It is visibility only and changes
nothing about collection.

---

> **Open follow-ups** for this page live in [`../plans/todo.md`](../plans/todo.md) under
> "Connections / Feeds ('Providers and Feeds') polish".
