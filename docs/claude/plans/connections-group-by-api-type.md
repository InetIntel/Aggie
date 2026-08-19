# Group-by-API-type Connections page + access-policy verification

## Context

Today the consolidated `/settings/connections` page ([ConnectionsIndex.tsx](src/pages/Settings/Connections/ConnectionsIndex.tsx)) renders a **flat sources list** (`SourcesSection`), and credentials live on a separate `/settings/credentials` route. The dropped-in mockup redesigns this into a **single page grouped by API type** (Ioda, Junkipedia, Cloudflare, Telegram, Mastodon), where each type's section shows *both* its credentials and its sources together, each with an "Add {type} api" (credential) button and an "Add {type} source" button. The user also asked to "add the access policy dropdown when configuring sources."

Exploration established two things that shape the plan:

1. **The access-policy dropdown already exists and is fully wired** — `SourceAccessPolicyFields` ([CreateEditSourceForm.tsx:243](src/pages/Settings/source/CreateEditSourceForm.tsx#L243)) renders Public / Restricted to teams / Public-until-cutoff with a team checkbox list, and is mounted on all five active source subforms (junkipedia, telegramUser, mastodon, ioda, cloudflare). So this is a **verify/keep** task, not new work (confirmed with user).
2. **The building blocks already exist** — reusable `SourcesSection`, `CredentialsSection`, `SourceDetailsView`, and every per-row primitive (warning badge, enable toggle, edit/delete dropdown, inline credential creation locked to a type). What's missing is the **per-type grouping layout** itself. Nothing iterates `CREDENTIAL_OPTIONS` to render one section per type. (Confirmed with user: per-type sections containing credentials + sources together.)

Outcome: one Connections page that mirrors the mockup — grouped by API type, credentials and sources co-located per type — reusing existing components and design tokens rather than the mockup's hardcoded hex/absolute positioning.

## Approach

### 1. Build the per-type grouped page

Replace the body of [ConnectionsIndex.tsx](src/pages/Settings/Connections/ConnectionsIndex.tsx) (currently just `<SourcesSection />`) with a grouped layout. Add one new presentational component, `ApiTypeSection`, rendered once per entry in `CREDENTIAL_OPTIONS` ([src/api/common.ts:74](src/api/common.ts#L74) — `junkipedia`, `telegramUser`, `mastodon`, `ioda`, `cloudflare`).

**Page shell** (`ConnectionsIndex`):
- Header row: page title ("Connections" / "API's") on the left; the existing global **Enable Fetching** toggle (`<Configuration />`, [SourcesSection.tsx:95](src/pages/Settings/source/SourcesSection.tsx#L95)) on the right — this is the single top-right toggle in the mockup.
- Fetch once at the page level and pass slices down: `useQuery(["sources"], getSources)`, `useQuery(["credentials"], getCredentials)`, `useQuery(["session"], getSession)`.
- Map `CREDENTIAL_OPTIONS` → `<ApiTypeSection type={type} sources={...} credentials={...} />`, filtering by `credential.type === type` and `source.media === type` (both use the same lowercase identifiers).

**`ApiTypeSection`** (new file, e.g. `src/pages/Settings/Connections/ApiTypeSection.tsx`) — a card (reuse the container pattern `bg-white dark:bg-gray-800 rounded-lg border border-slate-300 divide-y divide-slate-300`, [SourcesSection.tsx:96](src/pages/Settings/source/SourcesSection.tsx#L96)) containing:
- **Type header**: a human-friendly type label (small display-name map, e.g. `telegramUser → "Telegram"`, `ioda → "Ioda"`).
- **Credentials block**: chips for this type's credentials (reuse the `CredentialsSection` chip + trash pattern, [CredentialsSection.tsx:75-88](src/pages/Settings/Credentials/CredentialsSection.tsx#L75)) + a green **"Add {type} api"** button (`AggieButton variant='primary'`) opening `AggieDialog` → `CreateCredentialForm lockedType={type}` (the `lockedType` wiring already exists).
- **Sources block**: rows for this type's sources, reusing the existing row markup from [SourcesSection.tsx:99-200](src/pages/Settings/source/SourcesSection.tsx#L99) verbatim (nickname link → details popup, credential chip, warning badge, per-source `AggieSwitch` enable toggle, edit/delete `DropdownMenu`) + a teal **"Add {type} source"** button opening `CreateEditSourceForm`.
- Keep the delete `ConfirmationDialog`, edit `AggieDialog`→`CreateEditSourceForm`, and details `AggieDialog`→`SourceDetailsView` flows exactly as `SourcesSection` already has them.

To avoid duplicating all the dialog/mutation state five times, factor the shared source-row + source dialogs into a small reusable piece (or lift that state into `ConnectionsIndex` and pass handlers to each `ApiTypeSection`). Both `["sources"]` and `["credentials"]` caches are already shared, so adding a credential in one section instantly refreshes the source form's credential dropdown — no extra wiring.

### 2. Pre-select the type when adding a source from a section

[CreateEditSourceForm.tsx:326-328](src/pages/Settings/source/CreateEditSourceForm.tsx#L326) currently seeds `credentialType` from `source?.media || "ioda"`. Add an optional `defaultType?: CredentialOption` prop and seed `credentialType` with `source?.media || defaultType || "ioda"`, so the section's "Add {type} source" opens the form already scoped to that API type.

### 3. Access policy — verify only (no redesign)

Per the user's decision, keep `SourceAccessPolicyFields` as-is. Confirm during implementation that it's present on each of the five active subforms (already the case: junkipedia, telegramUser, mastodon, ioda, cloudflare). No change to the three modes or the team checkboxes. `telegramBot` is commented out of `CREDENTIAL_OPTIONS`, so its form's missing policy section is not reachable — leave it.

### 4. Styling — map mockup hexes to existing tokens (no raw hex)

The mockup's `var(--*)` tokens don't exist; map to what's already there and extend the Aggie palette per the config's own guidance ([tailwind.config.js:17-28](tailwind.config.js#L17)):
- `#166534` (green "Add api" button) → `AggieButton variant='primary'` (already `bg-green-800`). No change.
- `#237F9E` (edit pencil / teal accents) → existing `aggie-secondary-500` token.
- `#1A5E75` (teal "Add source" button) → add `aggie.secondary.650: '#1A5E75'` to `tailwind.config.js`, and add a **teal `secondary` variant** to [AggieButton.tsx:9](src/components/AggieButton.tsx#L9) (`bg-aggie-secondary-500 hover:bg-aggie-secondary-650 text-white`) — the current `secondary` is neutral slate, so use a new variant name like `teal` rather than overriding it.
- Warning badge `#FFFAE9/#F9CC50` → the existing orange warning pill already renders `{unreadErrorCount} Warnings` ([SourcesSection.tsx:135](src/pages/Settings/source/SourcesSection.tsx#L135)); keep it, or add `aggie.warning` yellow shades if the exact mockup yellow is wanted (cosmetic, low priority).
- Circular edit pencil (mockup's `#237F9E` circle): optional — the existing `DropdownMenu` (Edit/Delete) already covers edit. If the circular pencil is desired, build it from `AggieButton` with `rounded-full` + padding; otherwise keep the dropdown.
- `AggieSwitch` on-state is `bg-blue-600`; mockup shows green. Optional cosmetic — add a color prop/variant to `AggieSwitch` if we want the enable toggles green.

Inter is already the global font — no font work.

### 5. Routing / nav

`/settings/connections` is already routed to `ConnectionsIndex` and the nav "Manage Sources" link already points there ([AppRouter.tsx:100-106](src/AppRouter.tsx#L100), [Settings/index.tsx:22](src/pages/Settings/index.tsx#L22)). Keep the standalone `/settings/sources` and `/settings/credentials` routes during transition (per the CLAUDE.md keep-old-files convention); retire them once the grouped page is verified. Optionally relabel the nav link to "Connections".

## Critical files

- **New** `src/pages/Settings/Connections/ApiTypeSection.tsx` — per-type card (credentials block + sources block + two add buttons).
- [src/pages/Settings/Connections/ConnectionsIndex.tsx](src/pages/Settings/Connections/ConnectionsIndex.tsx) — page shell: title + global fetch toggle, fetch data, map `CREDENTIAL_OPTIONS` → `ApiTypeSection`.
- [src/pages/Settings/source/SourcesSection.tsx](src/pages/Settings/source/SourcesSection.tsx) — source-row markup + dialog/mutation flows to reuse/extract.
- [src/pages/Settings/Credentials/CredentialsSection.tsx](src/pages/Settings/Credentials/CredentialsSection.tsx) — credential chip + delete + `CreateCredentialForm` dialog to reuse.
- [src/pages/Settings/source/CreateEditSourceForm.tsx](src/pages/Settings/source/CreateEditSourceForm.tsx) — add `defaultType` prop; verify `SourceAccessPolicyFields` on all active subforms.
- [src/components/AggieButton.tsx](src/components/AggieButton.tsx) + [tailwind.config.js](tailwind.config.js) — teal button variant + `aggie.secondary.650` token.
- Reuse as-is: `AggieDialog`, `ConfirmationDialog`, `DropdownMenu`, `AggieSwitch`, `SourceDetailsView`, `Configuration`, `CreateCredentialForm`.
- [src/api/common.ts](src/api/common.ts) `CREDENTIAL_OPTIONS` — the grouping key.
- No backend or model changes — `accessPolicy`, `credentials`, `sources` schemas and controllers stay as-is.

## Verification

1. `npm run dev`, log in as admin, open `/settings/connections`.
2. **Grouping**: confirm one section per API type (Ioda, Junkipedia, Cloudflare, Telegram, Mastodon), each showing that type's credentials and that type's sources, with a green "Add {type} api" and a teal "Add {type} source" button. The global Enable Fetching toggle sits top-right.
3. **Add credential from a section**: click "Add {type} api" → `CreateCredentialForm` opens with the type locked; create one → it appears as a chip in that section and in the source form's credential dropdown (shared `["credentials"]` cache).
4. **Add source from a section**: click "Add {type} source" → form opens pre-scoped to that type; create a source → it appears as a row in that section.
5. **Per-source controls**: warning badge, enable toggle, and edit/delete work per row exactly as before; toggling enable persists (`editSource`).
6. **Access policy**: open Add/Edit Source for each active type → the "Access Policy" section with the Access Mode dropdown (Public / Restricted to teams / Public until cutoff) and team checkboxes renders and saves.
7. **No regressions**: `/settings/sources` and `/settings/credentials` still work during transition; a created source still fetches end-to-end (`populate('credentials')` resolves, reports arrive).
