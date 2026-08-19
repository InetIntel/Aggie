# Consolidated Sources + Credentials Page

## Context

Today, managing a data source is a two-page dance:

1. **Credentials page** (`/settings/credentials`) — user creates a credential, and is forced to type a **"Credential Name"** (required, 1–20 chars).
2. **Sources page** (`/settings/sources`) — user creates a source and picks a credential from a dropdown.

The goal is to **consolidate both into one page**, and to remove friction around the credential name.

### What the exploration established (the "why" behind the current design)

- **The credential `name` is a purely cosmetic label.** The Source→Credential link is by **ObjectId**, never by name (`Source.credentials: ObjectId ref 'Credentials'`, `backend/models/source.js:45`). Lookups are always `findById(...).populate('credentials')` (`backend/fetching/sourceToChannel.js:37-44`).
- **`name` is required but NOT unique** — no unique index, no uniqueness check on create (`backend/models/credentials.js:57-61`, `backend/api/controllers/credentialsController.js` `credential_create`). Duplicates are already legal.
- **Users don't type the name when configuring a source** — they pick from a `FormikDropdown` filtered by type; the dropdown value is the `_id`, the label is the `name` (`src/pages/Settings/source/CreateEditSourceForm.tsx:263-271`). The name is typed **only at creation** (`src/pages/Settings/Credentials/CreateCredentialForm.tsx`).
- **Multiple credentials of the same API type are fully supported today** — nothing constrains one-per-type; the source form already filters to all creds of the matching type (`CreateEditSourceForm.tsx:174-175`).

**Conclusion:** the name can be auto-generated with zero functional risk. Decisions (from user): **auto-generate a default name, keep it editable**; **one page with both a sources section and a credentials section** (credentials stay their own entities, just co-located).

## Approach

### 1. Auto-generated, editable credential name

Keep `name` in the model (required) but stop forcing the user to invent one.

**Frontend — prefill an editable default** in `src/pages/Settings/Credentials/CreateCredentialForm.tsx`:
- Fetch existing credentials (`getCredentials`) to compute a default label per selected type: e.g. `` `${credentialType} #${countOfThatType + 1}` ``.
- Seed each sub-form's Formik `initialValues.name` with that default instead of `""`, recomputing when `credentialType` changes (the type dropdown already lives in this component, lines 33-36). The existing `<FormikInput name='name' label='Credential Name' />` stays — the user can overwrite it. Keep the Yup `name` required rule so an emptied field still errors.
- For the OAuth flows (telegramUser lines 68-73/80-85, mastodon), pass the generated default as the `name` where `telegramUserName` / `mastodonCredentialName` are currently used, seeding those state values with the default.

**Backend — defensive fallback** in `credential_create` (`backend/api/controllers/credentialsController.js`): if `data.name` is missing/blank, generate `` `${type} #${count+1}` `` via `Credentials.countDocuments({ type })` before `Credentials.create(data)`. This guarantees a name even if a client omits it, so the field is truly optional server-side.

### 2. One consolidated page (both sections)

Create a single settings page that renders **both** the sources list and the credentials list, each with its own inline add/edit, reusing the existing components as sections rather than rewriting them.

- **New page:** `src/pages/Settings/Connections/ConnectionsIndex.tsx` (name TBD — "Connections" / "Sources & Credentials"). It composes two sub-sections:
  - a **Sources** section (list + "Add Source" dialog using `CreateEditSourceForm.tsx`),
  - a **Credentials** section (list + "Add Credential" dialog using `CreateCredentialForm.tsx`).
- Extract the list bodies of `SourcesIndex.tsx` and `CredentialsIndex.tsx` into presentational sub-components (`SourcesSection`, `CredentialsSection`) so both the old routes (kept during transition) and the new page can render them. Per CLAUDE.md convention, keep the old files (`*_old`) rather than deleting until cleanup.
- Both sections already share the `["credentials"]` and `["sources"]` TanStack Query caches, so creating a credential in one section instantly refreshes the source form's dropdown — no extra wiring needed.

- **Routing** (`src/AppRouter.tsx:91-104`): add the new route under `/settings` (e.g. `connections`), gated by the same `admin || team_lead` check that currently wraps `credentials` (line 99). Point the Settings nav at it and redirect/retire the separate `sources`/`credentials` links once verified. Update the settings sidebar/tabs in `src/pages/Settings/index.tsx`.

### 3. "Source name" — clearer terminology and/or dynamic entry

**Problem:** "Source Name" is the `nickname` field (`backend/models/source.js:32`, required, free-text, labeled "Source Name" in `CreateEditSourceForm.tsx:260`). It is a **display label for the source row** — but the term is ambiguous: users conflate it with the account/handle/URL they're pointing at, the credential name, or the media type. Nothing about the current label or help text explains what it's for or what to type.

**Two directions (decide during design):**

- **(a) Better terminology + guidance (low risk).** Rename the field label to something self-explanatory (e.g. "Display name" / "Label for this source") and add placeholder + helper text describing its purpose and giving an example (e.g. *"A name to identify this source in your lists, e.g. 'Elections — Mastodon #wildfire'"*). Purely a UI/label change in `CreateEditSourceForm.tsx`; no model change.
- **(b) Auto-generate it (like the credential name).** Since `nickname` is only a display label and is **not** used as a functional key anywhere the same way `name` isn't, it can be defaulted from the source's own inputs — e.g. `` `${media} — ${hashtag/keyword/handle}` `` — and left editable. Seed `initialValues.nickname` with a generated default that updates as the user fills type/keyword fields. **Caveat to verify:** confirm `nickname` is never relied on for lookup/dedup/matching before treating it as fully auto-generatable (`grep nickname` across `backend/` shows only the model index at `source.js:32`; double-check controllers/sockets during implementation).

Recommendation: do **(a)** always (cheap clarity win), and **(b)** as the default-with-override so users rarely have to type it — mirroring the credential-name approach for consistency.

### 4. Multiple hashtags/keywords per source (where the API supports it)

**Problem:** sources that fetch by hashtag/keyword currently accept only **one** value. Mastodon stores the mode in `keywords` and a **single** value in `lists` (`modeValue`); hashtag mode fetches exactly one tag timeline (`backend/fetching/channels/mastodon.js:242-254`, `normalizeSingleValue(this.modeValue)`). The UI exposes a single text input (`MastodonConditionalFields`, `CreateEditSourceForm.tsx:28-54`). Junkipedia similarly uses a single `lists` string.

**Goal:** let users enter **multiple hashtags at once** for credentials/media that support it (Mastodon hashtag mode first; audit Junkipedia and any keyword modes for the same treatment).

**Frontend:**
- Replace the single hashtag/keyword input with a **multi-value entry** (tag/chip input, or comma/newline-separated text that is split on submit). Keep it scoped to the modes that support multiples (hashtag; keyword if the backend can handle it).
- Store as an array (or a delimited string that the channel splits). Prefer a clear serialization — e.g. keep `lists` as a comma-separated string to avoid a model migration, and split in the channel.

**Backend (`backend/fetching/channels/mastodon.js`):**
- In hashtag mode, parse `modeValue` into multiple tags. Two implementation options:
  - **One request, multiple tags:** Mastodon's `GET /api/v1/timelines/tag/:tag` accepts `any[]` (also `all[]`, `none[]`) params to include additional tags in a single timeline — set the primary tag in the path and the rest as `any[]`. Fewest requests.
  - **Loop per tag:** issue one `/timelines/tag/{tag}` request per hashtag and merge/dedup results by status id. Simpler, more requests.
  - Confirm the current Mastodon API version's support before choosing; note the choice in the implementation.
- De-duplicate merged results by status id before handing items to the hooks pipeline.

**Scope note:** apply the multi-value pattern only to sources whose upstream API supports it. Audit each channel (`backend/fetching/channels/`) and enable multi-entry per-media rather than globally. IODA/Cloudflare (country-code based) and single-account sources are out of scope.

## Critical files

- `src/pages/Settings/Credentials/CreateCredentialForm.tsx` — prefill editable credential-name default.
- `backend/api/controllers/credentialsController.js` — server-side name fallback in `credential_create`.
- **New** `src/pages/Settings/Connections/ConnectionsIndex.tsx` + extracted `SourcesSection` / `CredentialsSection`.
- `src/pages/Settings/source/SourcesIndex.tsx`, `src/pages/Settings/Credentials/CredentialsIndex.tsx` — refactor list bodies into sections.
- `src/pages/Settings/source/CreateEditSourceForm.tsx` — source-name label/help + optional auto-gen; multi-hashtag entry (`MastodonConditionalFields`).
- `backend/fetching/channels/mastodon.js` — multi-hashtag fetch + dedup; audit sibling channels.
- `src/AppRouter.tsx` and `src/pages/Settings/index.tsx` — route + nav.
- No model change needed (`backend/models/credentials.js` `name` and `source.js` `nickname`/`lists` stay as-is; behavior changes only).

## Verification

1. `npm run dev`, log in as admin, go to the new consolidated page.
2. **Auto credential name:** open "Add Credential", pick a type → the Name field is pre-filled (e.g. `junkipedia #1`) and editable. Create one leaving the default; create a second of the same type → default becomes `#2`. Confirm both appear in the credentials section.
3. **Multiple instances:** open "Add Source", pick that type → the credential dropdown lists **both** same-type credentials. Create a source against each; confirm in Mongo that `source.credentials` holds the correct distinct `_id`s.
4. **Backend fallback:** `POST /api/credential` with no `name` (e.g. curl) → succeeds with a generated name.
5. **Source name:** confirm the relabeled field shows help/placeholder; if auto-gen is enabled, confirm a sensible default appears and is editable, and the saved source row shows it.
6. **Multiple hashtags (Mastodon):** create a Mastodon hashtag source with several hashtags → confirm reports arrive for each tag and duplicates (a post carrying two of the tags) appear once. Check `aggie-fetching` logs.
7. **Fetching still works end-to-end:** confirm created sources fetch (channel registers, `populate('credentials')` resolves) and reports arrive.
8. Confirm old `/settings/sources` and `/settings/credentials` routes still work (or redirect) during transition.
