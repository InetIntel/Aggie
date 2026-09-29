# Rename "Provider" → "Source" in the Providers and Feeds UI

## Context

The "Providers and Feeds" settings page was recently refactored, which introduced
the term **"Provider"** (a platform Aggie pulls from, e.g. Mastodon/IODA) into the
user-facing copy. The goal is to change **every user-visible occurrence of
"Provider"/"Providers" to "Source"/"Sources"** so the UI matches the desired term.

Scope is **display copy only** — routes (`/settings/connections`, `sources`),
component/folder names (`ConnectionsIndex`, `Connections/`), and internal code
identifiers (`providerLabel`, `PROVIDER_LABELS`, `ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER`)
are **not** changed, since the request is only for what's visible in the UI.

There is no i18n system — all strings are hardcoded JSX/TS literals.

## Consideration (terminology collision)

The app **already uses "Source"** as a distinct concept:
- `src/pages/Settings/index.tsx` has a separate nav item literally named `"Sources"`
  (team-lead monitors, route `sources`).
- The legacy `SourcesSection` and the backend `Source` model represent a **feed**.

After this change, "Provider" (a platform) becomes "Source", while a feed is *also*
internally a Source. Worth a visual sanity check in-app after the change.

## Changes (all are literal string edits)

### 1. Page title, heading, intro — `src/pages/Settings/Connections/ConnectionsIndex.tsx`
- `document.title`: `"Providers and Feeds - Aggie"` → `"Sources and Feeds - Aggie"`
- `<h1>`: `Providers and Feeds` → `Sources and Feeds`
- Intro paragraph, three occurrences of "Provider" → "Source":
  - `A <span>Provider</span> is a platform Aggie pulls from` → `A <span>Source</span> is a platform...`
  - `that lets Aggie reach a Provider` → `reach a Source`
  - `Connect a Provider first, then add Feeds to it` → `Connect a Source first, then add Feeds to it`

### 2. Settings nav labels — `src/pages/Settings/index.tsx`
- admin, team_lead, and monitor/viewer entries: `"Providers and Feeds"` → `"Sources and Feeds"`
  (keep `to:` routes and icons unchanged). Leave the pre-existing `"Sources"` entry as-is.

### 3. Legacy sources page heading — `src/pages/Settings/source/SourcesSection.tsx`
- `<h1>`: `Providers and Feeds` → `Sources and Feeds`

### 4. Per-provider card eyebrow — `src/pages/Settings/Connections/ApiTypeSection.tsx`
- eyebrow label `Provider` → `Source`

### 5. Feed details field — `src/pages/Settings/source/SourceDetailsView.tsx`
- `<DetailField label='Provider'>` → `label='Source'`

### 6. Add/edit feed form — `src/pages/Settings/source/CreateEditSourceForm.tsx`
- `<label>Provider</label>` → `Source`
- placeholder `"Select Provider"` → `"Select Source"`

### 7. Credentials list header — `src/pages/Settings/Credentials/CredentialsSection.tsx`
- `<p>Provider</p>` → `<p>Source</p>`

### 8. Add connection/credential form — `src/pages/Settings/Credentials/CreateCredentialForm.tsx`
- `<label>Provider</label>` → `Source`
- placeholder `"Select provider"` → `"Select source"`

## Explicitly NOT changed
- Route paths (`connections`, `sources`), component/folder names, imports.
- `providerLabel()` / `PROVIDER_LABELS` / `ALLOW_MULTIPLE_CONNECTIONS_PER_PROVIDER`
  in `src/api/common.ts` — code identifiers and platform-name map values, not visible
  as the word "Provider".
- The word "Connection" — unchanged; only "Provider" → "Source".

## Verification
1. `npm run dev` and open `https://localhost:8000/settings/connections` as an admin.
   - Tab title "Sources and Feeds - Aggie"; `<h1>` "Sources and Feeds"; intro says "Source" (×3).
   - Each platform card's eyebrow reads "Source".
2. Open a feed's details → field label reads "Source".
3. Add/edit feed form + add-connection form → dropdown label + placeholder read "Source" / "Select Source".
4. Credentials list header reads "Source".
5. Settings left-nav shows "Sources and Feeds"; confirm the separate "Sources" item still renders.
6. `git grep -n "Provider" src/pages/Settings` — remaining hits should only be code
   identifiers/comments, not JSX text.
