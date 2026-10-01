# Top navigation bar

The top nav (`AggieNavbar`) lives entirely in [src/Navbar.tsx](../../../src/Navbar.tsx):
the logo, the main links (Alerts, Social Media Posts, Incidents, Dashboard), the user
button, the MFA badge, the dark-mode toggle, and the hamburger.

## Responsive behavior

The nav is **mobile-first with stepped Tailwind breakpoints** (`sm:` / `md:`): the base
classes are the scaled-down small-screen sizes, and `md:` restores the full desktop
sizing. Scaling is applied to the container padding, the logo, the link text, and the
right-side controls (e.g. logo `w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10`, links
`text-xs sm:text-sm md:text-base`).

The main links stay inline at every width — they do **not** collapse into the hamburger.
Instead, the two least-essential controls are hidden on small screens:

- The **MFA badge** (`MFA Off` / `Enrolled`) — `hidden md:inline-block`.
- The **dark-mode toggle** — `hidden md:flex`. Below `md` the theme follows the OS
  `prefers-color-scheme`; the manual toggle simply isn't shown.

The username, nav links, and hamburger remain visible at all widths (just smaller).

The old vertical **divider** between "Social Media Posts" and "Incidents" was removed
(the `divider1` entry and its render branch are gone), so `mainLinks` is now a flat list
of real links.
