# Top navigation bar

The top nav (`AggieNavbar`) lives entirely in [src/Navbar.tsx](../../../src/Navbar.tsx):
the logo, the main links (Alerts, Social Media Posts, Incidents, Dashboard), the user
button, and the hamburger.

## Responsive behavior

The nav is **mobile-first with stepped Tailwind breakpoints** (`sm:` / `md:`): the base
classes are the scaled-down small-screen sizes, and `md:` restores the full desktop
sizing. Scaling is applied to the container padding, the logo, the link text, and the
user button (e.g. logo `w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10`, links
`text-sm md:text-base`).

Below `lg` (1024px) the inline link row is hidden (`hidden lg:flex`) and the same links are
rendered as a `lg:hidden` section at the top of the hamburger panel, above a `border-b`
divider that separates them from the settings links.

`lg` is deliberately conservative rather than the tightest breakpoint that technically
fits. Measuring this header off-app repeatedly under-estimated its real width, and the
cost of guessing low is a visibly broken bar; the cost of guessing high is using the
hamburger on a tablet. If you want the links back at a narrower width, lower this one
breakpoint and check it in the running app, not in a static reproduction.

The settings half of the panel comes from `menuLinks(role, isTeamLead, userId)` in
[src/pages/Settings/index.tsx](../../../src/pages/Settings/index.tsx), shared with the
left nav on the settings pages. Its entries are relative to `/settings`, so the navbar
renders them as `'/settings/' + link.to` while the left nav uses `link.to` directly
against the `/settings` route. "My Profile" (`user/<userId>`) is added outside the
role switch, since every signed-in user has one; the rest is role-dependent. That section highlights the current page using the same `isActive()`
helper the inline links use. The panel is `overflow-y-auto max-h-[calc(100svh-4rem)]` so
an admin (longest settings list, plus four main links, plus Logout) can still reach the
bottom on a short screen.

### The no-overflow contract

The nav is `flex justify-between` on a `w-full` element, which overflows the viewport if
nothing in it is allowed to shrink. Four classes keep that from happening, and they should
be preserved when adding anything to the bar:

- `shrink-0` on the left group (logo + links). It must **not** be `min-w-0`: the links are
  `whitespace-nowrap`, so a left group that is allowed to shrink keeps full-width content
  inside a narrower box, and the links overflow it and paint on top of the user button.
  That produces an overlap with no page scrollbar, so a check that only watches
  `documentElement.scrollWidth` will not catch it. Assert instead that the links row's
  right edge stays left of the right group's left edge.
- `min-w-0` on the right group and the username `Link`, so the right side is what yields.
  Without it a flex item's `min-width: auto` pins it to its intrinsic content width.
- `truncate` plus a `max-w` cap on the username text, **and `min-w-0` on every box between
  it and the right group**. `truncate` is inert on a flex item whose `min-width` is `auto`:
  the name then refuses to shrink past its `max-w` cap, the `<a>` around it shrinks anyway,
  and the pill spills out over the hamburger. The username is deliberately the one element
  that absorbs the squeeze, and without `truncate` a long one wraps to two lines and makes
  the whole bar taller.
- `shrink-0` on the hamburger `Menu` wrapper, so the button is never pushed off-screen.
- `gap-2` on the `<nav>` itself, so the two groups cannot collide.

In short: the left group is rigid, the username is elastic. Anything added to the bar
belongs on the right and needs either `shrink-0` (if it must stay whole) or a truncation
rule (if it can give).

Do **not** add `overflow-hidden` or `overflow-x-clip` to the `<nav>`: the `Menu.Items`
dropdown is absolutely positioned and would be clipped.

## What is deliberately not in the nav

- **MFA status.** Shown on your own profile under Security
  ([src/pages/Settings/user/components/SecuritySection.tsx](../../../src/pages/Settings/user/components/SecuritySection.tsx)),
  which renders the same `MFA Enrolled` / `MFA Off` badge and, unlike the nav, resolves
  correctly when an admin is viewing another user.
- **The dark-mode toggle.** Now a Theme row in Display preferences
  ([src/pages/Settings/user/components/DisplayPreferencesSection.tsx](../../../src/pages/Settings/user/components/DisplayPreferencesSection.tsx)),
  which is `isSelf`-gated. It applies on click rather than on Save Preferences, because
  unlike the other rows in that section it is a `localStorage` preference local to the
  browser, not a server-side user preference.

Both were removed from the bar because they were what pushed it past the viewport edge
between 768px and 1024px.

## Theme state

Light/dark state lives in [src/hooks/ThemeProvider.tsx](../../../src/hooks/ThemeProvider.tsx),
mounted at the root in [src/index.tsx](../../../src/index.tsx) next to `SocketProvider`.
It owns the `localStorage.theme` read/write, the `dark` class on `documentElement` that
Tailwind's `darkMode: 'class'` keys off, and the cross-tab `storage` listener. Consume it
with `useTheme()`, which returns `{ isDark, setIsDark }`.

It is a provider rather than a plain hook on purpose: the control that sets the theme
(Display preferences) and the effect that applies it are in different parts of the tree,
and two independent copies of the state would drift, since same-tab writes do not fire
`storage` events.

The old vertical **divider** between "Social Media Posts" and "Incidents" was removed
(the `divider1` entry and its render branch are gone), so `mainLinks` is now a flat list
of real links.
