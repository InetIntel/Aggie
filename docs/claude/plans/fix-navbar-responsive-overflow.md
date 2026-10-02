# Fix navbar overflow at smaller screen widths

## Context

At narrow widths the top nav runs off the right edge of the page: the hamburger button is
clipped by the viewport and the username pill wraps onto two lines, making the bar taller
and misaligned.

The cause is structural, in `src/Navbar.tsx:117-243`. The nav is
`flex justify-between` on a `w-full` element, but nothing in it is allowed to give:

- The links row carries `whitespace-nowrap` and no flex item has `min-w-0`, so the left
  group's flex basis is its full intrinsic content width and it never shrinks.
- The right-hand cluster has no `shrink-0`, so once the left group wins the space fight the
  cluster is simply pushed past the viewport edge.
- The username pill has no `truncate`/`whitespace-nowrap`, so it is the one thing that does
  "respond" — by wrapping to two lines.

Measured intrinsic width at the `md` tier is roughly 790px against a 768px breakpoint, so
the bar is already over budget the moment the MFA badge and dark-mode toggle appear at
`md`. Below `sm` the four full-text links alone are wider than a 375px phone screen.

Intended outcome: the header fits at every width, with no horizontal page overflow and no
wrapped pill, and the two controls that were only ever in the header for convenience move
to the profile page where their real settings already live.

## Approach

Three parts: remove two controls from the header, collapse the main links into the existing
hamburger on phones, and add the flex guards that make overflow structurally impossible.

### 1. Remove the MFA badge and dark-mode toggle from the header

Per the user: both come out of the nav entirely and live under the username pill's
destination, `/settings/user/:id` (`src/pages/Settings/user/UserProfile.tsx`).

**MFA badge — no new UI needed.** `src/pages/Settings/user/components/SecuritySection.tsx:234`
already renders the identical `MFA Enrolled` / `MFA Off` badge, with better logic (it falls
back to the viewed user's record when an admin views someone else). Just delete the
navbar's `<span>` at `src/Navbar.tsx:165-177`.

**Dark-mode toggle — move into Display preferences.**
`src/pages/Settings/user/components/DisplayPreferencesSection.tsx` is already gated by
`isSelf` at `src/pages/Settings/user/UserProfile.tsx:386`, which is exactly right for a
per-browser preference. Add a Theme row there, reusing the local `Segmented` component
(`DisplayPreferencesSection.tsx:16-62`) with `Light` / `Dark`.

Important: the existing rows in that section are server-persisted and gated behind the
**Save Preferences** button. The theme is `localStorage`-only and must apply on click.
Render the Theme row visually separated from the saved rows (after the `Example` row,
before the save button) with a short caption such as "Saved to this browser" so the two
behaviours are not confused.

**Lifting the theme state.** Theme state currently lives only in `src/Navbar.tsx:68-98`
(`isDark`, the `document.documentElement.classList` effect, the `localStorage` write, and
the cross-tab `storage` listener). Once the toggle leaves the navbar, the apply-effect
still needs a home and the settings page needs to drive it, so the state has to be shared.

Create `src/hooks/ThemeProvider.tsx`, following the existing
`src/hooks/WebsocketProvider.tsx` provider pattern:

- Move `src/Navbar.tsx:68-98` into it verbatim (lazy `useState` initializer reading
  `localStorage.theme` then `prefers-color-scheme`, the `dark` class effect, the `storage`
  listener).
- Export a `useTheme()` hook returning `{ isDark, setIsDark }`.
- Mount `<ThemeProvider>` in `src/index.tsx` around `<AppRouter />`, next to
  `<SocketProvider>`.
- `DisplayPreferencesSection` consumes `useTheme()`.
- Delete the theme state and effects from `Navbar.tsx`.

Do not duplicate `useTheme()` as a plain hook used in two places — two copies would each
hold their own `isDark` and drift, since same-tab writes do not fire `storage` events.

### 2. Collapse the main links into the hamburger below `sm`

The four links (`mainLinks`, `src/Navbar.tsx:28-33`) come to roughly 480px at the base text
size, so they cannot stay inline on a phone.

- Add `hidden sm:flex` to the links row wrapper (`src/Navbar.tsx:132`).
- Add a `sm:hidden` section at the **top** of the existing `Menu.Items` panel
  (`src/Navbar.tsx:197`) listing the same `mainLinks` entries, styled like the existing
  settings items (`src/Navbar.tsx:202`), with a `border-b border-slate-200` divider below
  the section so main links read as distinct from the settings links.
- Reuse the component's existing `isActive(to, not)` helper (`src/Navbar.tsx:60-65`) to
  highlight the current page in that section, matching the inline links' active treatment.
- Change the panel's `overflow-hidden` to `overflow-y-auto` and add
  `max-h-[calc(100svh-4rem)]`, so a monitor/admin with the full settings list plus four
  main links plus Logout can still reach the bottom on a short phone screen.

Target `sm` (640px). The `sm`–`md` tier measures around 585px of content against a 640px
breakpoint, which fits, but the margin is modest — verify at 640–720px in the browser and
step the collapse up to `md` if it looks cramped.

### 3. Structural guards so overflow cannot recur

Content-independent, so a long username or a future nav item cannot reintroduce the bug:

- Nav container (`src/Navbar.tsx:117`): add `gap-2` so the two groups cannot touch.
- Left group (`:118`) and right group (`:152`): add `min-w-0`.
- Username pill: add `min-w-0` to the `Link` (`:155`) and `truncate` to the inner `div`
  (`:159`), plus a `max-w` cap (for example `max-w-[10rem] md:max-w-[14rem]`). This is the
  one element that should absorb the squeeze, and `truncate` also fixes the two-line wrap
  seen in the report.
- Hamburger `Menu` wrapper (`:193`): add `shrink-0` so the button is never pushed off-screen.

Do **not** add `overflow-hidden` / `overflow-x-clip` to the `<nav>` — the `Menu.Items`
dropdown is absolutely positioned and would be clipped.

### 4. Cleanup

Remove imports orphaned by this change in `src/Navbar.tsx:1-22`: `faSun`, `faMoon`, and the
already-dead `DropdownMenu` (line 21), `faExternalLinkSquareAlt`, `faShieldHalved`, `faKey`.
Leave the unused `helpfulLinks` constant (`:35-48`) in place — it is pre-existing dead code
and out of scope here; note it in the PR instead.

### 5. Docs

Rewrite the Responsive behavior section of
`docs/claude/architecture/navbar.md`, which currently documents the opposite rules ("main
links stay inline at every width", MFA badge and toggle `hidden md:*`). New content: links
collapse into the hamburger below `sm`; the MFA badge lives in `SecuritySection` and the
theme toggle in `DisplayPreferencesSection`; theme state lives in
`src/hooks/ThemeProvider.tsx`; the `min-w-0` / `shrink-0` / `truncate` contract and why the
nav must not get `overflow-hidden`.

## Files

- `src/Navbar.tsx` — the bulk of the change
- `src/hooks/ThemeProvider.tsx` — new
- `src/index.tsx` — mount the provider
- `src/pages/Settings/user/components/DisplayPreferencesSection.tsx` — Theme row
- `docs/claude/architecture/navbar.md` — update

No change needed to `src/pages/Settings/user/components/SecuritySection.tsx` or
`UserProfile.tsx`.

## Verification

Run `npm run dev` and open `https://localhost:8000`.

1. **Overflow.** With devtools responsive mode, sweep 320px → 1440px. At no width should
   the page scroll horizontally or the hamburger be clipped. Check the breakpoint edges
   specifically: 639/640, 767/768, 1023/1024.
2. **Pill.** The username pill stays on one line at every width. Test a long username (the
   admin user, or temporarily render a long string) and confirm it ellipsises rather than
   pushing the hamburger off.
3. **Mobile menu.** Below 640px the four links are gone from the bar and present at the top
   of the hamburger panel, above the divider; each navigates correctly and the current page
   is highlighted. Confirm the panel scrolls when logged in as an admin (longest menu).
4. **Theme.** `/settings/user/<your id>` → Display preferences → Theme toggles light/dark
   immediately, without pressing Save Preferences. Reload: the choice persists. Open a
   second tab and flip the theme there: the first tab follows (the `storage` listener).
   Confirm the theme still applies on `/login` after logging out.
5. **Save Preferences.** Changing the theme must not mark the clock/date/timezone form
   dirty, and Save Preferences must still work independently.
6. **MFA.** The badge is gone from the header and still visible under Security on your own
   profile. As an admin, view another user's profile and confirm their badge reflects
   *their* enrollment, and that no theme row appears (the section is `isSelf`-gated).
7. `npm run build` completes.
