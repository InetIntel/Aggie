# Navbar responsive scaling + remove divider

## Context

The top navigation bar (`AggieNavbar`) uses fixed Tailwind sizing with **no responsive
breakpoints** — the same padding, text size, gaps, and logo size apply at every viewport
width. On smaller screens the row (`Alerts`, `Social Media Posts`, `Incidents`,
`Dashboard`, the `admin` user button, the `MFA Off` badge, the dark-mode toggle, and the
hamburger) crowds and looks rough.

Goal: make the nav elements scale down proportionally as the screen narrows (via stepped
Tailwind breakpoints), hide the two least-essential controls (the MFA badge and the
light/dark toggle) on the smallest screens, and remove the vertical divider bar between
`Social Media Posts` and `Incidents`.

Everything lives in a single file: [src/Navbar.tsx](src/Navbar.tsx).

## Decisions (confirmed with user)

- **Scaling:** stepped Tailwind breakpoints (`sm:`/`md:`), mobile-first — smaller base
  sizes that step **up** to today's sizing at `md`. Idiomatic for this Tailwind 3 codebase.
- **Tiny screens:** hide the `MFA Off/Enrolled` badge and the dark-mode toggle below `md`
  (< 768px). Keep the username visible (just smaller). Note: below `md` the theme still
  follows the OS `prefers-color-scheme` default; the manual toggle simply isn't shown there.

## Changes — all in `src/Navbar.tsx`

Tailwind is mobile-first, so the **base** classes become the small-screen (scaled-down)
values and `md:` restores the current desktop sizing. `md` is the "tiny" cutoff for the two
hidden controls; adjust to `sm` later if the hide threshold should be smaller.

### 1. Remove the divider

- Delete the `divider1: { type: "divider", to: "" }` entry from `mainLinks` (line ~33).
- Simplify the link `.map` (lines ~136–156): drop the `!path.type ? (...) : (...)` ternary
  and the divider `else` branch (`<div ... className='border border-l border-gray-300'>`),
  rendering just the `<Link>` for every entry.
- Drop the now-unused `type?: string` from the `LinkOptions` interface (line ~26).

### 2. Scale the container and left group

- Nav container (line ~120): `px-4 py-2` → `px-2 sm:px-3 md:px-4 py-1.5 md:py-2`.
- Left group wrapper (line ~121): `gap-2` → `gap-1 sm:gap-2`.
- Logo `<svg>` (line ~127): `w-10 h-10 ... px-2` → `w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 ... px-1.5 md:px-2`.

### 3. Scale the nav links

- Link row wrapper (line ~135): `gap-1 mx-2` → `gap-0.5 sm:gap-1 mx-1 md:mx-2`, and add a
  responsive text size so links shrink: append `text-sm md:text-base`.
- Each `<Link>` (line ~141): `px-2` → `px-1 sm:px-2`.

### 4. Scale / hide the right-side controls

- Right group wrapper (line ~159): `gap-2` → `gap-1 sm:gap-2`.
- Inner user/MFA wrapper (line ~161): `gap-2` → `gap-1 sm:gap-2`.
- User button inner div (line ~166): `px-3 py-1 ... gap-2 ... text-xs` →
  `px-2 sm:px-3 py-1 ... gap-1.5 sm:gap-2 ... text-[11px] sm:text-xs`.
- MFA badge `<span>` (lines ~172–184): add `hidden md:inline-block` to its class list so it
  is hidden below `md`. (It's currently always inline.)
- Dark-mode toggle `<div>` (line ~189): change base `flex` → `hidden md:flex` so it's hidden
  below `md`; also `px-3` → `px-2 sm:px-3`.
- Hamburger `Menu.Button` (line ~201): `px-3 py-1` → `px-2 sm:px-3 py-1`.

## Out of scope (leave as-is)

- Main links stay inline at all widths (no collapse into the hamburger) — this matches the
  request to scale, not restructure.
- Not fixing the pre-existing a11y note (dark toggle is a `<div onClick>` not a `<button>`)
  or the redundant divider classes (the divider is being removed anyway).

## Verification

1. `npm run dev` and open `https://localhost:8000` (logged in so the nav renders).
2. Use browser devtools responsive mode and drag the width down from desktop:
   - Confirm padding, gaps, logo, link text, and buttons shrink in steps at ~768px and
     ~640px (no abrupt overflow; nav stays on one line without horizontal page scroll — per
     the standing "no horizontal overflow" rule).
   - Confirm the **divider** between `Social Media Posts` and `Incidents` is gone.
   - Confirm below ~768px the **MFA badge** and the **dark-mode toggle** disappear, while the
     `admin` username, nav links, and hamburger remain.
3. Toggle dark mode at desktop width and confirm the scaled classes still read correctly in
   dark theme (`dark:` variants untouched).
4. Verify the active-link green underline still shows on the current page.
