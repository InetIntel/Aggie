# Connection pill palette: remove error/warning-looking colors

## Context

On the Feeds/Connections page (`/settings/connections`, whose page title is
"Sources and Feeds"), each connection is shown as a colored pill. The color is
assigned purely by a connection's position within its provider (connection 1, 2,
3, ...), so it carries **no status meaning**. But the third slot is
dark-pink-on-light-pink (`#4A1626` on `#F3C0CF`), which sits visually next to the
app's error color (red) and reads to users like an error message. The fourth slot
is amber (`#4A3410` on `#F6D79A`), which overlaps the app's **warning** color
(orange/amber).

Across the app, color already carries meaning: **red = error/danger**
(e.g. warning-count badge `bg-red-100 text-red-800` at `ApiTypeSection.tsx:319`,
`AggieButton` `danger`/`warning` variants, `AggieToken` `light:red`/`dark:red`)
and **orange/amber = warning** (restricted access pill `bg-orange-100
text-orange-800`, `SourcesSection` warning badge, amber usage across Navbar /
Dashboard / incidents). Reusing those hue families for a non-status decorative
pill is misleading.

Goal: rebuild the connection palette so **no** slot uses a red/pink/rose or
orange/amber combo, and document those families as reserved so future edits don't
reintroduce the problem.

## Where the change lives

Everything is in a single file — the palette is hardcoded and not shared, so one
edit updates both the connection chip in the list and every feed-row pill:

- `src/pages/Settings/Connections/ApiTypeSection.tsx`
  - `CONNECTION_COLORS` array — lines 87-93 (the 5-color palette)
  - Comment block above it — lines 81-85
  - Consumed by `getConnectionColor` (94-97), `ConnectionPill` (99-121), and the
    list chip (~256-278). No other file references these colors, so nothing else
    needs to change.

No Tailwind theme change is needed (these are inline-style hexes; there is no
central status palette in `tailwind.config.js`).

## Change 1 — Rebuild the palette (exclude red/pink/orange/amber)

Replace the `CONNECTION_COLORS` array with a cool-toned, categorical set of five
distinguishable light-bg / dark-text colors, none of which fall in the
error (red/pink/rose) or warning (orange/amber) families. Keep the existing
`{ bg, text, icon }` shape and inline-style usage unchanged.

Recommended palette (dark text on light bg; each pair clears WCAG AA for normal
text — dark ~`#1x-3x` on light ~`#Cx-Ex`):

```ts
const CONNECTION_COLORS: ConnectionColor[] = [
  { bg: "#CFE9F1", text: "#123642", icon: "#123642" }, // 1: teal
  { bg: "#CBDDF7", text: "#17335C", icon: "#17335C" }, // 2: sky blue
  { bg: "#D6D5F5", text: "#262264", icon: "#262264" }, // 3: indigo
  { bg: "#E3CDEF", text: "#3D1A4E", icon: "#3D1A4E" }, // 4: violet
  { bg: "#DBE0E8", text: "#2A3644", icon: "#2A3644" }, // 5: slate
];
```

Notes:
- Drops the previous chartreuse (slot 1, greenish — near the success/`lime`
  status hue), rose (slot 3), and amber (slot 4) entirely.
- Order matters visually (adjacent slots should be distinguishable): teal → sky →
  indigo → violet → slate spreads across the cool range plus a neutral. At
  execution, eyeball the five side-by-side in-app; if any two adjacent pills look
  too similar, nudge lightness rather than reaching back into red/orange/amber.

## Change 2 — Doc comment guardrail

Update the comment above the palette (currently `ApiTypeSection.tsx:81-85`) to
state the reserved-color rule, so a future maintainer adding/reordering colors
knows which families to avoid. Approximately:

```ts
// Connection pill colors: a fixed, accessible light-bg / dark-text palette keyed
// by a connection's position WITHIN its provider (not by status), so connection
// 1/2/3 look the same across providers and read identically in the Connections
// list and on every feed. The palette cycles if a provider has more connections
// than entries.
//
// RESERVED — do NOT use these hue families here (they carry meaning elsewhere and
// make a non-status pill look like an alert):
//   * red / pink / rose  -> error & danger
//   * orange / amber     -> warning
// Keep connection colors to neutral/cool decorative hues (teal, blue, indigo,
// violet, slate, ...).
```

## Out of scope (noted, not changed)

- `AggieButton` `light:rose` variant (`AggieButton.tsx:22`) is a general
  decorative button style, not a status/connection color, and was not flagged.
  Leaving it as-is; mention only.

## Verification

1. `npm run dev` and open `https://localhost:8000/settings/connections`.
2. Find a provider with 3+ connections (or create test connections) so slots 3
   and 4 render. Confirm no pill is pink/rose or amber, and colors are
   distinguishable.
3. Cross-check a feed row that uses connection 3/4 shows the same new color as its
   connection chip in the list (consistency between `ConnectionPill` and the list
   chip).
4. Confirm real error/warning UI is still visually distinct: the red
   warning-count badge on a feed and the orange "Restricted" access pill should no
   longer share a look with any connection pill.
5. `npm run build` to ensure no TS/build errors.
