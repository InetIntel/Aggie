# Plan: User-configurable date/time display preferences

## Context

Today, dates and times are formatted inconsistently across the app: some sites use hardcoded UTC 24-hour strings (`formatIsoTime` → `YYYY-MM-DD HH:MM`, duplicated in several places), others use the browser locale via `toLocaleString()`. There is no way for a user to control whether times show as 12h or 24h, whether dates read MM/DD/YYYY or DD/MM/YYYY, or whether times render in their local zone or UTC. This is the "USA vs EU" item in `docs/claude/plans/todo.md`.

**Goal:** Let each user pick, in their own account settings:
- **Clock:** 12-hour vs 24-hour
- **Date order:** MM/DD/YYYY vs DD/MM/YYYY
- **Timezone:** browser-local (default) vs UTC

Defaults for users who never choose: **24h + DD/MM/YYYY + browser-local** (EU-style). Along the way, centralize the scattered formatting into one shared hook so every date/time site honors the preference.

## Decisions (confirmed with user)

- **Scope:** Centralize into one formatter, then convert **all** date/time display sites.
- **Timezone:** Default browser-local, but expose a UTC toggle in settings.
- **Defaults:** 24h, DD/MM/YYYY, local.

---

## Backend

### 1. User model — add `preferences`
`backend/models/user.js` — add to `userSchema`:
```js
preferences: {
  timeFormat: { type: String, enum: ['12h', '24h'], default: '24h' },
  dateFormat: { type: String, enum: ['MDY', 'DMY'], default: 'DMY' },
  timeZone:   { type: String, enum: ['local', 'utc'], default: 'local' },
},
```
Because these have schema defaults, existing user documents read back with the defaults with no migration needed.

### 2. Allow self-update of preferences
`backend/api/controllers/userController.js` → `user_update` (lines 256–284). Preferences are a nested object, so the current flat `allowedFields` copy loop won't handle them cleanly. Add explicit, whitelisted handling:
```js
if (req.body.preferences && typeof req.body.preferences === 'object') {
  const { timeFormat, dateFormat, timeZone } = req.body.preferences;
  if (timeFormat) user.preferences.timeFormat = timeFormat;
  if (dateFormat) user.preferences.dateFormat = dateFormat;
  if (timeZone)   user.preferences.timeZone   = timeZone;
}
```
Available to both self and admin (allowed regardless of the `isAdmin && !isSelf` role branch). Enum validation on save rejects bad values.

### 3. Expose preferences in the session
`backend/api/controllers/authController.js` → `session` (lines 209–219). Add to `userStripped`:
```js
preferences: user.preferences || { timeFormat: '24h', dateFormat: 'DMY', timeZone: 'local' },
```
The session query is already the app-wide source of the current user, so this makes prefs readable everywhere without a new endpoint.

---

## Frontend

### 4. Types
- `src/api/session/types.ts` — add `preferences?: UserPreferences` to `Session`.
- `src/api/users/types.ts` — add `preferences?: UserPreferences` to `User` and to `UserEditableData`.
- Define `UserPreferences` (`{ timeFormat: "12h"|"24h"; dateFormat: "MDY"|"DMY"; timeZone: "local"|"utc" }`) once — put it in `src/api/session/types.ts` and import where needed.

### 5. Central formatter — the core of this change
Create `src/utils/dateFormat.ts` with pure, preference-driven builders using `Intl.DateTimeFormat` (no new dependency; `Intl` is already available and `toLocale*` is already in use):
```ts
export const DEFAULT_PREFS: UserPreferences = { timeFormat: "24h", dateFormat: "DMY", timeZone: "local" };

// pure functions taking prefs explicitly — usable outside React too
export function formatDate(d, prefs): string      // date only, honors MDY/DMY + tz
export function formatTime(d, prefs): string      // time only, honors 12h/24h + tz
export function formatDateTime(d, prefs): string  // date + time
```
Implementation notes:
- Map `dateFormat` → `Intl` options via an explicit part order (`day/month/year`) so DMY vs MDY is deterministic rather than locale-guessed; `timeFormat` → `hour12: prefs.timeFormat === "12h"`; `timeZone: prefs.timeZone === "utc" ? "UTC" : undefined`.
- Handle nullish/invalid dates the way current helpers do (`"—"` / `"Unknown Date"`).

Then add a React hook `src/utils/useFormatters.ts`:
```ts
export function useFormatters() {
  const { data: session } = useQuery(["session"], getSession, { staleTime: 10000 });
  const prefs = session?.preferences ?? DEFAULT_PREFS;
  return useMemo(() => ({
    formatDate:     (d) => formatDate(d, prefs),
    formatTime:     (d) => formatTime(d, prefs),
    formatDateTime: (d) => formatDateTime(d, prefs),
  }), [prefs]);
}
```
This reuses the existing `useQuery(["session"], getSession)` pattern (already the app-wide current-user source per `AppRouter.tsx`), so no context provider is needed.

### 6. Convert all display sites to the hook
Replace inline/duplicated formatting. Representative sites (pattern repeats):
- `src/utils/format.tsx` — keep `formatIsoTime`/`formatDate` temporarily but mark deprecated; new work goes through the hook. Remove once callers migrate.
- `src/components/DateTime.tsx` — keep `ReactTimeAgo` "x ago", but route the absolute `timeOrDate` fallback through `useFormatters` (honors 12h/24h).
- Incidents: `pages/incidents/TableView/IncidentsTable.tsx` (`formatStamp`), `Incident/IncidentInfo.tsx` (locally-redefined `formatIsoTime`), `IncidentListItem.tsx` (string slice), `TableView/CompareIncidentCard.tsx` (`formatDateTime`).
- Reports: `components/SocialMediaListItem/index.tsx` (report date + IODA/Cloudflare event times), `pages/Reports/TableView/reportColumns.tsx`.
- Filters: `components/filters/FilterDateTime.tsx`, `components/filters/DateSelector.tsx` (range/selected-date display — the picker input stays; only the rendered label changes).
- Settings: `pages/Settings/user/components/WebAuthnDeviceRow.tsx` (`formatDate`).
- Comments: `pages/incidents/Incident/CommentTimeline.tsx`, `Comment.tsx`.

For any non-component/pure-function caller, pass prefs through explicitly using the pure functions from `dateFormat.ts`.

### 7. Preferences UI in account settings
Add a **"Display preferences"** section to the user's own profile: `src/pages/Settings/user/UserProfile.tsx` (self view). Three controls (radio groups / selects consistent with existing form styling):
- Clock: 12-hour / 24-hour
- Date format: MM/DD/YYYY / DD/MM/YYYY (show a live example using `useFormatters`)
- Timezone: Local / UTC

Wire submit through the existing `editUser` api call (`src/api/users/index.ts`, `PUT /api/user/:_id`) sending `{ preferences }`; on success invalidate/refetch `["session"]` so every formatted date updates immediately. Reuse the existing edit-dialog/mutation pattern already in `UserProfile.tsx`/`CreateEditUserForm.tsx` rather than a new page.

---

## Files to modify (summary)

Backend: `backend/models/user.js`, `backend/api/controllers/userController.js`, `backend/api/controllers/authController.js`.
Frontend new: `src/utils/dateFormat.ts`, `src/utils/useFormatters.ts`.
Frontend edit: `src/api/session/types.ts`, `src/api/users/types.ts`, the display sites in §6, and `src/pages/Settings/user/UserProfile.tsx` for the UI.

## Verification

1. `npm run dev`; log in.
2. In own profile, set **12h + MM/DD/YYYY + Local**, save. Confirm the session refetches and an incidents-table timestamp + a reports timestamp both flip to `MM/DD/YYYY hh:mm AM/PM` in local time without a page reload.
3. Switch to **24h + DD/MM/YYYY + UTC**; confirm the same timestamps now show `DD/MM/YYYY HH:MM` and match UTC.
4. Check a date-range filter label, a comment date, and a WebAuthn device row reflect the choice.
5. Confirm a brand-new user (or one with no `preferences`) renders as 24h + DD/MM/YYYY + local (defaults).
6. Backend guard check: `PUT /api/user/:id` with `preferences.timeFormat: "bogus"` is rejected by the enum; a non-admin cannot alter another user's prefs (403 from the existing self/admin gate).

## Note
Per your convention, once approved I'll place the working plan under `docs/claude/plans/` alongside the other plan files (this file is the plan-mode scratch copy).
