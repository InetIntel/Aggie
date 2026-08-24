# Connections Page — grouped Sources + Credentials

## Context

Managing a data source used to be a two-page dance:

1. **Credentials page** (`/settings/credentials`) — user creates a credential and is forced to type a required **"Credential Name"** (1–20 chars).
2. **Sources page** (`/settings/sources`) — user creates a source and picks a credential from a dropdown.

The goal is one **Connections** page (`/settings/connections`) that co-locates sources and credentials, **grouped by API type** (Ioda, Junkipedia, Cloudflare, Telegram, Mastodon), removes friction around the credential name, clarifies the "Source name" field, supports multiple hashtags where the upstream API allows it, and keeps the existing access-policy controls.

### What exploration established (the "why")

- **The credential `name` is a purely cosmetic label.** The Source→Credential link is by **ObjectId**, never by name (`Source.credentials: ObjectId ref 'Credentials'`, `backend/models/source.js:45`); lookups are `findById(...).populate('credentials')` (`backend/fetching/sourceToChannel.js:37-44`). `name` is required but **not unique** — duplicates are already legal (`backend/models/credentials.js:57-61`). Users never type the name when configuring a source; they pick from a `FormikDropdown` whose value is the `_id` and label is the `name` (`CreateEditSourceForm.tsx:263-271`). Name is typed **only at creation**. → It can be auto-generated with zero functional risk (**decision: auto-generate a default, keep it editable**).
- **Multiple credentials of the same API type are already supported** — nothing constrains one-per-type; the source form filters to all creds of the matching type (`CreateEditSourceForm.tsx:174-175`).
- **The access-policy dropdown already exists and is fully wired** — `SourceAccessPolicyFields` (`CreateEditSourceForm.tsx:243`) renders Public / Restricted to teams / Public-until-cutoff with a team checkbox list, mounted on all five active subforms (junkipedia, telegramUser, mastodon, ioda, cloudflare). So access policy is a **verify/keep** task, not new work.
- **The building blocks already exist** — reusable `SourcesSection`, `CredentialsSection`, `SourceDetailsView`, and every per-row primitive (warning badge, enable toggle, edit/delete dropdown, inline credential creation locked to a type). What was missing is the **per-type grouping layout**; nothing iterated `CREDENTIAL_OPTIONS` to render one section per type.

Outcome: one Connections page that mirrors the mockup — grouped by API type, credentials and sources together per type — reusing existing components and design tokens rather than the mockup's hardcoded hex/absolute positioning. Credentials remain their own entities, just co-located.

## Approach

### 1. Per-type grouped page

Replace the body of `ConnectionsIndex.tsx` (currently a flat `<SourcesSection />`) with a grouped layout. Add one new presentational component, `ApiTypeSection`, rendered once per entry in `CREDENTIAL_OPTIONS` (`src/api/common.ts:74` — `junkipedia`, `telegramUser`, `mastodon`, `ioda`, `cloudflare`).

**Page shell (`ConnectionsIndex`):**

- Header row: page title ("Connections") on the left; the existing global **Enable Fetching** toggle (`<Configuration />`, `SourcesSection.tsx:95`) on the right.
- Fetch once at the page level and pass slices down: `useQuery(["sources"], getSources)`, `useQuery(["credentials"], getCredentials)`, `useQuery(["session"], getSession)`.
- Map `CREDENTIAL_OPTIONS` → `<ApiTypeSection type={type} sources={...} credentials={...} />`, filtering by `credential.type === type` and `source.media === type` (same lowercase identifiers).

**`ApiTypeSection`** (new file, `src/pages/Settings/Connections/ApiTypeSection.tsx`) — a card (reuse `bg-white dark:bg-gray-800 rounded-lg border border-slate-300 divide-y divide-slate-300`, `SourcesSection.tsx:96`) containing:

- **Type header**: human-friendly label via a small display-name map (`telegramUser → "Telegram"`, `ioda → "Ioda"`).
- **Credentials block**: chips for this type's credentials (reuse the chip + trash pattern, `CredentialsSection.tsx:75-88`) + a green **"Add {type} api"** button (`AggieButton variant='primary'`) opening `AggieDialog` → `CreateCredentialForm lockedType={type}` (the `lockedType` wiring already exists).
- **Sources block**: rows for this type's sources, reusing the row markup from `SourcesSection.tsx:99-200` verbatim (nickname link → details popup, credential chip, warning badge, per-source `AggieSwitch` enable toggle, edit/delete `DropdownMenu`) + a teal **"Add {type} source"** button opening `CreateEditSourceForm`.
- Keep the delete `ConfirmationDialog`, edit `AggieDialog`→`CreateEditSourceForm`, and details `AggieDialog`→`SourceDetailsView` flows exactly as `SourcesSection` already has them.

To avoid duplicating the dialog/mutation state five times, factor the shared source-row + source dialogs into a small reusable piece (or lift that state into `ConnectionsIndex` and pass handlers to each `ApiTypeSection`). Both `["sources"]` and `["credentials"]` caches are already shared, so adding a credential instantly refreshes the source form's credential dropdown — no extra wiring.

### 2. Pre-select the type when adding a source from a section

`CreateEditSourceForm.tsx:326-328` seeds `credentialType` from `source?.media || "ioda"`. Add an optional `defaultType?: CredentialOption` prop and seed `credentialType` with `source?.media || defaultType || "ioda"`, so a section's "Add {type} source" opens the form already scoped to that API type.

### 3. Auto-generated, editable credential name

Keep `name` required in the model but stop forcing the user to invent one.

**Frontend** (`src/pages/Settings/Credentials/CreateCredentialForm.tsx`):

- Fetch existing credentials (`getCredentials`) to compute a default per selected type: `` `${credentialType} #${countOfThatType + 1}` ``.
- Seed each sub-form's Formik `initialValues.name` with that default instead of `""`, recomputing when `credentialType` changes. The existing `<FormikInput name='name' label='Credential Name' />` stays — the user can overwrite it. Keep the Yup `name` required rule so an emptied field still errors.
- For the OAuth flows (telegramUser, mastodon), pass the generated default where `telegramUserName` / `mastodonCredentialName` are used, seeding those state values with the default.

**Backend** (`credential_create` in `backend/api/controllers/credentialsController.js`): if `data.name` is missing/blank, generate `` `${type} #${count+1}` `` via `Credentials.countDocuments({ type })` before `Credentials.create(data)`, so the field is truly optional server-side.

### 4. "Source name" — clearer terminology + optional auto-gen

"Source Name" is the `nickname` field (`backend/models/source.js:32`, required, free-text, labeled in `CreateEditSourceForm.tsx:260`) — a **display label** for the source row, but the term is ambiguous (users conflate it with the account/handle/URL, the credential name, or the media type).

- **(a) Better terminology + guidance (always, low risk):** rename the label to something self-explanatory (e.g. "Display name" / "Label for this source") and add placeholder + helper text with an example (_"A name to identify this source in your lists, e.g. 'Elections — Mastodon #wildfire'"_). UI-only change in `CreateEditSourceForm.tsx`.
- **(b) Auto-generate it (default-with-override):** since `nickname` is only a display label, default it from the source's own inputs — e.g. `` `${media} — ${hashtag/keyword/handle}` `` — and keep it editable, mirroring the credential-name approach. **Verify first** that `nickname` is never used for lookup/dedup/matching (`grep nickname` across `backend/` shows only the model index at `source.js:32`; double-check controllers/sockets during implementation).

### 5. Multiple hashtags/keywords per source (where the API supports it)

Sources that fetch by hashtag/keyword currently accept only **one** value. Mastodon stores the mode in `keywords` and a single value in `lists` (`modeValue`); hashtag mode fetches exactly one tag timeline (`backend/fetching/channels/mastodon.js:242-254`, `normalizeSingleValue(this.modeValue)`). Junkipedia similarly uses a single `lists` string.

**Frontend:** replace the single hashtag/keyword input (`MastodonConditionalFields`, `CreateEditSourceForm.tsx:28-54`) with a **multi-value entry** (tag/chip input, or comma/newline-separated text split on submit), scoped to modes that support multiples. Prefer keeping `lists` as a comma-separated string to avoid a model migration, and split in the channel.

**Backend** (`backend/fetching/channels/mastodon.js`): in hashtag mode, parse `modeValue` into multiple tags. Either **one request** using Mastodon's `GET /api/v1/timelines/tag/:tag` `any[]` param (primary tag in path, rest as `any[]`; fewest requests), or **loop per tag** and merge. Confirm current Mastodon API support before choosing; **de-duplicate merged results by status id** before the hooks pipeline.

**Scope:** apply per-media only where the upstream API supports it (Mastodon hashtag first; audit Junkipedia and keyword modes). IODA/Cloudflare (country-code based) and single-account sources are out of scope.

### 6. Access policy — verify only (no redesign)

Keep `SourceAccessPolicyFields` as-is. Confirm it's present on each of the five active subforms (junkipedia, telegramUser, mastodon, ioda, cloudflare). No change to the three modes or the team checkboxes. `telegramBot` is commented out of `CREDENTIAL_OPTIONS`, so its form's missing policy section is unreachable — leave it.

### 7. Styling — map mockup hexes to existing tokens (no raw hex)

The mockup's `var(--*)` tokens don't exist; map to what's there and extend the palette per `tailwind.config.js:17-28`:

- `#166534` (green "Add api" button) → `AggieButton variant='primary'` (already `bg-green-800`). No change.
- `#237F9E` (edit pencil / teal accents) → existing `aggie-secondary-500`.
- `#1A5E75` (teal "Add source" button) → add `aggie.secondary.650: '#1A5E75'` to `tailwind.config.js`, and add a **teal `secondary` variant** to `AggieButton.tsx:9` (`bg-aggie-secondary-500 hover:bg-aggie-secondary-650 text-white`) — use a new variant name like `teal` rather than overriding the neutral-slate `secondary`.
- Warning badge `#FFFAE9/#F9CC50` → the existing orange warning pill already renders `{unreadErrorCount} Warnings` (`SourcesSection.tsx:135`); keep it, or add `aggie.warning` yellow shades if the exact mockup yellow is wanted (cosmetic).
- Circular edit pencil: optional — the existing `DropdownMenu` already covers Edit/Delete; build a `rounded-full` `AggieButton` only if desired.
- `AggieSwitch` on-state is `bg-blue-600`; mockup shows green — optional cosmetic color prop/variant.

Inter is already the global font — no font work.

### 8. Routing / nav

`/settings/connections` is already routed to `ConnectionsIndex` and the nav "Manage Sources" link points there (`AppRouter.tsx:100-106`, `Settings/index.tsx:22`). Keep the standalone `/settings/sources` and `/settings/credentials` routes during transition (per the CLAUDE.md keep-old-files convention); retire them once the grouped page is verified. Optionally relabel the nav link to "Connections". Gate the route by the same `admin || team_lead` check that wraps `credentials`.

## Critical files

- **New** `src/pages/Settings/Connections/ApiTypeSection.tsx` — per-type card (credentials block + sources block + two add buttons).
- `src/pages/Settings/Connections/ConnectionsIndex.tsx` — page shell: title + global fetch toggle, fetch data, map `CREDENTIAL_OPTIONS` → `ApiTypeSection`.
- `src/pages/Settings/source/SourcesSection.tsx` — source-row markup + dialog/mutation flows to reuse/extract.
- `src/pages/Settings/Credentials/CredentialsSection.tsx` — credential chip + delete + `CreateCredentialForm` dialog to reuse.
- `src/pages/Settings/Credentials/CreateCredentialForm.tsx` — prefill editable credential-name default.
- `src/pages/Settings/source/CreateEditSourceForm.tsx` — `defaultType` prop; source-name label/help + optional auto-gen; multi-hashtag entry (`MastodonConditionalFields`); verify `SourceAccessPolicyFields` on all active subforms.
- `backend/api/controllers/credentialsController.js` — server-side name fallback in `credential_create`.
- `backend/fetching/channels/mastodon.js` — multi-hashtag fetch + dedup; audit sibling channels.
- `src/components/AggieButton.tsx` + `tailwind.config.js` — teal button variant + `aggie.secondary.650` token.
- `src/api/common.ts` `CREDENTIAL_OPTIONS` — the grouping key.
- `src/AppRouter.tsx` and `src/pages/Settings/index.tsx` — route + nav.
- Reuse as-is: `AggieDialog`, `ConfirmationDialog`, `DropdownMenu`, `AggieSwitch`, `SourceDetailsView`, `Configuration`, `CreateCredentialForm`.
- No model changes — `credentials.name`, `source.nickname`/`lists`, `accessPolicy`, and controllers stay as-is; behavior changes only.

## Verification

1. `npm run dev`, log in as admin, open `/settings/connections`.
2. **Grouping:** one section per API type (Ioda, Junkipedia, Cloudflare, Telegram, Mastodon), each showing that type's credentials and sources, with a green "Add {type} api" and a teal "Add {type} source" button; global Enable Fetching toggle top-right.
3. **Auto credential name:** "Add {type} api" → Name pre-filled (e.g. `junkipedia #1`), editable and locked to the type; create leaving the default, create a second same-type → default becomes `#2`; both appear as chips and in the source form's credential dropdown (shared `["credentials"]` cache).
4. **Backend fallback:** `POST /api/credential` with no `name` → succeeds with a generated name.
5. **Add source from a section:** "Add {type} source" → form opens pre-scoped to that type; create → appears as a row. Confirm in Mongo that `source.credentials` holds the correct distinct `_id`s across multiple same-type creds.
6. **Source name:** relabeled field shows help/placeholder; if auto-gen is enabled, a sensible default appears, is editable, and the saved row shows it.
7. **Per-source controls:** warning badge, enable toggle (persists via `editSource`), and edit/delete work per row as before.
8. **Access policy:** open Add/Edit Source for each active type → the Access Policy section (Access Mode dropdown + team checkboxes) renders and saves.
9. **Multiple hashtags (Mastodon):** create a hashtag source with several tags → reports arrive for each tag and a post carrying two tags appears once; check `aggie-fetching` logs.
10. **No regressions:** created sources fetch end-to-end (channel registers, `populate('credentials')` resolves); `/settings/sources` and `/settings/credentials` still work during transition.

---

> **Open follow-ups** for the Connections/Feeds page (formerly this doc's TODO list) now live in
> [`../plans/todo.md`](../plans/todo.md) under "Connections / Feeds ('Providers and Feeds') polish".
