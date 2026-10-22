# Top navigation bar

The top nav (`AggieNavbar`) lives entirely in [src/Navbar.tsx](../../../src/Navbar.tsx):
the logo, the main links (Alerts, Social Media Posts, Incidents, Dashboard), the user
button, and the hamburger.

## Responsive behavior

The bar is **fit-driven, not breakpoint-driven**: it measures itself and gives up space
only once it has actually run out of room. Narrowing the window, it gives up three things
in order, tracked as `fit.squeeze` in [src/Navbar.tsx](../../../src/Navbar.tsx):

| `squeeze` | What changes |
| --- | --- |
| 0 | Everything shows: logo, links at `text-base`, username pill, hamburger. |
| 1 | The username pill is hidden. |
| 2 | The links drop to `text-sm`. |
| 3 | The links move into the hamburger panel (a section at the top, above a `border-b` divider that separates them from the settings links). |

The steps are cumulative: once the username is hidden it stays hidden at narrower widths,
including after the links have moved into the menu ("My Profile" in the panel covers it).

### How the fit is measured

- **Reset, then step up.** A layout effect resets `squeeze` to 0 on mount, on window
  `resize`, when web fonts finish loading (`document.fonts.ready`), and when the username
  changes. A second layout effect then checks `navFits(nav)` and bumps `squeeze` by one
  per render until the bar fits or reaches 3. Layout effects run before paint, so the
  intermediate steps are never visible.
- **`navFits`** compares the natural widths of the two groups (left: logo + links;
  right: username + hamburger) against the nav's inner width minus its padding and
  `gap`. That only works because **both groups are `shrink-0`**: their widths are what
  they need, not what flexbox squeezed them to.
- **Why not breakpoints.** The bar's width depends on the username length and on the
  browser's font-size setting, since everything in it is rem-sized. Fixed breakpoints
  either shrink things when there is plenty of room, or, with a larger browser font,
  keep the links inline after they no longer fit, pushing the hamburger against the
  window edge. Both happened before this design. Em-based breakpoints (which do scale
  with the browser font) were tried too, but they still shrink things at fixed widths.
  If you reach for them anyway: `min-[40em]:` silently compiles to nothing, because
  Tailwind 3 drops `min-*`/`max-*` variants whose units differ from the px `screens`
  config. Switching `screens` to em app-wide would break the existing `min-[1080px]:`
  and `min-[1456px]:` classes on other pages. A custom variant via `addVariant` works.

### Widths must depend on `squeeze`, not the viewport

While the links are inline (`squeeze` 0-2), nothing that affects the bar's width may use
a viewport breakpoint (`sm:`/`md:`). If the logo shrank at 640px, for example, it would
free room and the username would reappear partway through narrowing the window, then
disappear again. That is why the nav padding, the gaps, the logo and the hamburger use
their full desktop sizes at `squeeze` 0-2 and only take the smaller phone sizing
(`sm:`/`md:`) once `linksInMenu` is true. Vertical-only classes (`py-1.5 md:py-2`) are
fine either way.

### Where the steps land

These are measured, not configured. With "ronniegross" as the username they are about
680 / 560 / 520px at the browser's default font size and 1000 / 820 / 765px at Chrome's
"Very large" (24px). A long username moves the first step out (835px at the default
size, with the name capped at `max-w-[14rem]` and truncated beyond that).

To check a change, sweep the window width down and back up at the default font size and
at a larger one (Chrome: Settings > Appearance > Font size). Each step should land only
when the gap between the two groups is nearly gone, and the username should never
reappear while narrowing.

The nav only renders when logged in, so to test it without a session, render the real
`AggieNavbar` on its own: a small entry file that mounts it inside `QueryClientProvider`
and `MemoryRouter` with `isAuthenticated` and a stub `session`, bundled with the webpack
and `babel-preset-react-app` already in `node_modules`, and styled with the app's CSS
from `npx tailwindcss -i src/index.css`. Drive that page with Playwright (also in
`node_modules`), and set the browser font size with the CDP call
`Page.setFontSizes({ fontSizes: { standard: 24 } })`. Run webpack through its Node API:
`webpack/bin/webpack.js` stalls on an interactive prompt to install `webpack-cli`.
Injecting static nav markup into a page is not a substitute, since it skips the
measuring code entirely.

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

- **Both groups are `shrink-0`.** Nothing in the bar is elastic; the squeeze steps make it
  fit instead. Making a group `min-w-0` again would break `navFits` (it would read the
  squeezed width and think everything fits). The links are `whitespace-nowrap`, and a
  squeezed left group lets them paint over the right group with no page scrollbar, so a
  check that only watches `documentElement.scrollWidth` will not catch that. Assert
  instead that the links row's right edge stays left of the right group's left edge.
- **The username's `max-w-[14rem]` and `truncate`** only cap a very long name so it
  can't crowd out the links. The name is never squeezed below that; it is hidden whole.
- **`gap-2` on the `<nav>`** keeps the two groups apart, and `navFits` counts it.
- **Anything new in the bar** goes in one of the two groups, stays `shrink-0`, and needs
  a place in the squeeze order (or must be small enough to always fit next to the logo and
  hamburger).

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
