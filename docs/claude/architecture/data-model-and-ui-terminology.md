# Data Model & UI Terminology

_Last updated: 2026-08-10_

A Rosetta stone for reading Aggie's MongoDB directly. Collection names and field names were
set early and never renamed as the product vocabulary evolved, so several stored names have
drifted from their on-screen labels. This maps every collection, model, and notably-renamed
field to what a user actually sees in the app.

## TL;DR — the three biggest gotchas

1. **`Group` (collection `groups`) is called "Incident" everywhere in the UI.** The word
   "Group" never appears on screen. The `#10`-style number you search by is the `idnum` field,
   not `_id`.
2. **One `reports` collection shows up as two different nav sections** — "Alerts" vs. "Social
   Media Posts" — split purely by the report's `_media` value.
3. **The "Tags" you see are the `SMTCTag` model / `smtctags` collection.** The file is
   `tag.js`, but the model is `SMTCTag`, referenced everywhere as `ref: 'SMTCTag'`.

## Collections at a glance

Mongoose is pinned to `^5.9.16`. No model sets an explicit collection name, so every
collection name below is Mongoose's **default pluralization** of the model name.

| UI concept | Model | Mongo collection | File |
|---|---|---|---|
| Incident | `Group` | `groups` | [`backend/models/group.js`](../../../backend/models/group.js) |
| Alert / Social Media Post | `Report` | `reports` | [`backend/models/report.js`](../../../backend/models/report.js) |
| Source | `Source` | `sources` | [`backend/models/source.js`](../../../backend/models/source.js) |
| Tag | **`SMTCTag`** | `smtctags` | [`backend/models/tag.js`](../../../backend/models/tag.js) |
| API Credential | `Credentials` | `credentials` | [`backend/models/credentials.js`](../../../backend/models/credentials.js) |
| Team | `Team` | `teams` | [`backend/models/team.js`](../../../backend/models/team.js) |
| User | `User` | `users` | [`backend/models/user.js`](../../../backend/models/user.js) |
| Deepfake results | `aiprediction` | `aipredictions` | [`backend/models/aiprediction.js`](../../../backend/models/aiprediction.js) |
| ASN daily metrics | `AsnDailyStats` | `asndailystats` | [`backend/models/asnDailyStats.js`](../../../backend/models/asnDailyStats.js) |
| ASN info (latest) | `AsnInfo` | `asninfos` | [`backend/models/asnInfo.js`](../../../backend/models/asnInfo.js) |
| Mastodon OAuth state | `MastodonAuthSession` | `mastodonauthsessions` | [`backend/models/mastodonAuthSession.js`](../../../backend/models/mastodonAuthSession.js) |
| Telegram login state | `TelegramAuthSession` | `telegramauthsessions` | [`backend/models/telegeramAuthSession.js`](../../../backend/models/telegeramAuthSession.js) |

The two auth-session collections auto-expire via a TTL index (`expiresAt`,
`expireAfterSeconds: 0`) — Mongo deletes rows on its own.

**One extra collection with no model — `counters`.** The `Group.idnum` sequence is backed by
a `counters` collection created by the `mongoose-sequence` plugin, not by any file in
`backend/models/`. It holds a single doc like `{ id: 'idnum', seq: 14 }` — `seq` is the last
incident number handed out. If you ever need to reset or reseed incident numbering, this is the
document to touch.

**Not collections:** [`backend/models/batch.js`](../../../backend/models/batch.js) (a helper
class that checks reports out by mutating `Report.checkedOutBy`/`checkedOutAt`) and
[`backend/models/query.js`](../../../backend/models/query.js) (an abstract filter-builder base
class) live in `backend/models/` but persist nothing of their own.

### What's actually in the DB right now

Collections are created lazily on first write, so a defined model won't show up in Mongo until
something is saved. Verified against the live `aggie` database (`DATABASE_NAME=aggie`):

- **Populated:** `reports`, `groups`, `sources`, `credentials`, `users`, `counters`.
- **Present but empty:** `smtctags`, `aipredictions`, `asninfos`, `teams`,
  `mastodonauthsessions`, `telegramauthsessions`.
- **Not created yet:** `asndailystats` — the `AsnDailyStats` model exists in code but nothing
  has written to it in this database, so the collection doesn't exist.

Live spot-checks that confirm the field map: `_media` values in use are `ioda`, `cloudflare`,
`twitter`; `sources.media` and `credentials.type` values are `ioda`, `cloudflare`,
`junkipedia` — all within the enforced enum. `groups` documents carry exactly the schema
fields (`idnum`, `status`, `verification_status`, `publication_status: ['Not Published']`,
`_reports`, `smtcTags`, `tags`, …).

## Terminology drift

### "Incident" = `Group`

The backend model, API module (`src/api/groups/`), TypeScript type, and socket events
(`groups:update`) all say **Group**, but every user-facing label says **Incident** — the page
header, the "Create New Incident" button, the `/incidents` route, and the `src/pages/incidents/`
folder. The code even re-aliases the data mid-render (`data.results.map((incident) => …)` over
a `Group[]`). See [`src/pages/incidents/index.tsx`](../../../src/pages/incidents/index.tsx) and
[`src/Navbar.tsx`](../../../src/Navbar.tsx).

The human-facing incident ID (`#10`) is the `idnum` field — an auto-incrementing counter added
by the `mongoose-sequence` plugin — **not** the Mongo `_id`.

### "Alerts" and "Social Media Posts" are both `reports`

There is a single `Report` model. The UI splits it into two nav sections by the report's
`_media` value (see [`src/api/common.ts`](../../../src/api/common.ts) and
[`src/pages/Reports/AllReportsList.tsx`](../../../src/pages/Reports/AllReportsList.tsx)):

| Nav section | `_media` values |
|---|---|
| **Alerts** | `ioda`, `cloudflare` |
| **Social Media Posts** | `twitter`, `telegramUser`, `mastodon` |

Same collection, same document shape — the label depends only on where the report came from.

### "Tags" = `smtctags`, and there are two tag fields

The model is `SMTCTag`. Documents (both `Report` and `Group`) carry **two** tag-ish fields:

- `smtcTags` — an array of ObjectId refs to `smtctags`. **This is what renders as "Tags"** in
  the UI (`<TagsList values={item.smtcTags} />`).
- `tags` — a separate plain array of strings, largely legacy/internal, not the on-screen tags.

### Field name → on-screen label

| Stored field | Shown in UI |
|---|---|
| `irrelevant` (`"true"`/`"false"`/`"maybe"`) | **"Ignore" / "Investigate"** — the negative field name is flipped into a positive verb |
| `public: false` | **"Deleted"** badge (inverted — the badge shows when `!public`) |
| `veracity: "Confirmed True"` / `"Confirmed False"` | **"True" / "False"** |
| `directPopulationCoverageScore` / `indirectPopulationCoverageScore` | **"DPC" / "IPC"** badges |
| `escalated: true` | **"Escalated"** badge |
| `closed: true` | **"Closed"** badge |
| `_group`, `_reports`, `_sources`, `_media` | relationship links (see below) |

## Status & state fields

### Report triage — `irrelevant`

Stored as a string enum `['false', 'true', 'maybe']` (default `'maybe'`). Presented to users
as a positive action pair, not "irrelevant":

- `irrelevant === "false"` → **"Investigate"** (green)
- `irrelevant === "true"` → **"Ignore"** (red)
- `"maybe"` / unset → no badge

### Report `veracity`

Enum `['Unconfirmed', 'Confirmed True', 'Confirmed False']`, but displayed as
"Unconfirmed" / **"True"** / **"False"** (see
[`src/components/VeracityToken.tsx`](../../../src/components/VeracityToken.tsx)).

### Incident status — three fields collapsed into one label

A `Group` stores three separate status fields:

- `verification_status` — enum `['false', 'true', 'maybe']`, default `'maybe'`
- `confirmation_status` — enum `['false', 'true', 'maybe']`, default `'maybe'`
- `publication_status` — an **array** of strings, enum `['Not Published', 'Published', 'Shared with Networks']`, default `['Not Published']` (a validator forbids "Not Published" and "Published" together)

The UI collapses these into a single status label with a precedence order (see
[`src/pages/incidents/IncidentStatuses.tsx`](../../../src/pages/incidents/IncidentStatuses.tsx)):
Shared with Networks → Published → Confirmed / Unable to Confirm → Confirming / Unable to
Verify → Verifying. Elsewhere they render as three separate chips (Verifying/Verified,
Confirming/Confirmed, Published/Not Published).

There is also a separate `Group.status` string (`['new', 'working', 'alert', 'closed']`,
default `'new'`) enforced in a pre-save hook via `Group.statusOptions` in
[`backend/shared/group.js`](../../../backend/shared/group.js) — distinct from the three status
fields above.

## Relationships & underscore fields

Relationship fields use a leading-underscore naming convention:

- `Report._group` (ObjectId) ↔ `Group._reports` (ObjectId array) — the report↔incident link,
  bidirectional.
- `Report.smtcTags` / `Group.smtcTags` → `SMTCTag`.
- `Source.credentials` → `Credentials` (**required**); `Source.accessPolicy.teams` → `Team`.
- `User.teams` → `Team`; `Group.assignedTo` / `Group.creator` / `Group.comments[].author` → `User`.
- `aiprediction.reportId` → `Report`.

### The `_sources` caveat, in detail

`Report._sources` looks like a normal relationship but does not behave like one. Compare the
two schema lines in [`backend/models/report.js`](../../../backend/models/report.js):

```js
_sources: [{ type: String,               ref: "Source", index: true }],  // L43
_group:   {  type: SchemaTypes.ObjectId,  ref: "Group",  index: true  },  // L46
```

Both carry a `ref:`, but `_sources` is typed **`String`** while `_group` is a real
**`ObjectId`**. Mongoose's `ref` only functions together with `type: ObjectId` — so on
`_sources` the `ref: "Source"` is effectively **decorative**. The source's id is stored as a
plain string, and `.populate("_sources")` will not hydrate it the way `.populate("_group")`
does. Verified in the live DB — the two sibling fields hold the same 24-hex value in different
BSON types:

```
_sources: [ '698e38132064ae1a2b75d0ef' ]        // JS string
_group:   ObjectId('6a2307cb9a10f469ec538e0d')  // real ObjectId
```

Because they are different types, `report._sources[0] === source._id` is **false** (string vs
ObjectId), and a `$lookup`/`.populate` that assumes ObjectId silently matches nothing.

**Where the string comes from.** The fetching pipeline deliberately stringifies the source id
before storing it:

- [`backend/fetching/hooks/postToReport.js`](../../../backend/fetching/hooks/postToReport.js#L27)
  — `post._sources = [ sourceID ]` (from `getSourceID(channelID)`)
- [`backend/fetching/channels/ioda.js`](../../../backend/fetching/channels/ioda.js#L406) and
  [`backend/fetching/channels/cloudflare.js`](../../../backend/fetching/channels/cloudflare.js#L287)
  — `_sources: String(this.sourceId)`, literally wrapped in `String(...)`

**How the app copes.** Rather than join back to `sources`, the report **denormalizes** its
origin at fetch time into two sibling fields, so the UI never needs to populate `_sources`:

- `_media: [String]` — the platform name(s), e.g. `["ioda"]`
- `_sourceNicknames: [String]` — the source's human-readable nickname, copied onto the report

Consistent with that, **nothing in the codebase calls `.populate("_sources")`** — the field is
consumed as a raw id string.

**Practical takeaway.** When joining reports to sources:

- A `$lookup` from `reports._sources` to `sources._id` needs a type cast (`$toObjectId` /
  `$toString`) on one side, or it returns no matches.
- To display or identify a report's source in app code, prefer the already-denormalized
  `_media` / `_sourceNicknames` fields over resolving `_sources`.

## Enums worth knowing (and a CLAUDE.md correction)

The currently **enforced** `Source.media` / `Credentials.type` enum is only:

```
['ioda', 'cloudflare', 'junkipedia', 'telegramBot', 'telegramUser', 'mastodon']
```

(see [`backend/config/models/sourceConfigs.js`](../../../backend/config/models/sourceConfigs.js)
and [`backend/config/models/credentialsConfigs.js`](../../../backend/config/models/credentialsConfigs.js)).
`twitter` and `crowdtangle` linger only as legacy branches in the credentials secret-validator —
the top-level CLAUDE.md prose lists more source types than the schema currently accepts.

User roles have **no schema enum**, but the effective set (from `User.permissions` in
[`backend/models/user.js`](../../../backend/models/user.js)) is: `admin`, `manager`, `monitor`,
`viewer`, `team_lead`.

## Where names get translated

The stored-value ↔ UI-value conversions happen in the query builders, not the schemas:

- [`backend/models/query/report-query.js`](../../../backend/models/query/report-query.js) —
  e.g. "Read"/"Unread" → `read` boolean, veracity casing, `groupId` `"any"`/`"none"` special
  cases.
- [`backend/models/query/group-query.js`](../../../backend/models/query/group-query.js) — the
  incident-side equivalents.

If a query in the UI doesn't match what you see in Mongo, this is usually where the mapping
lives.
