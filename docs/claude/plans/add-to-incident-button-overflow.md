# Fix "Add to Incident" button overflow on small screens

## Context

On the alerts list (internally the **Reports** list), each alert row renders an
"Add to Incident" button in a fixed 1/5-width grid column. On smaller viewports
the button's label spills out of its column and overflows horizontally.

Root cause: in [ReportListItem.tsx:98](../../../src/pages/Reports/components/ReportListItem.tsx#L98)
the row is a `grid grid-cols-5` where the content (`SocialMediaListItem`) takes
`col-span-4` and the incident area gets a single column (1/5 of the row width),
with no responsive breakpoints. The button is an `AggieButton`, and
[AggieButton.tsx:7](../../../src/components/AggieButton.tsx#L7) applies
`text-nowrap` by default, so the "Add to Incident" text cannot wrap and instead
overflows its narrow column on small screens.

Intended outcome: the label wraps onto multiple lines (centered) within its
column so nothing overflows horizontally, keeping the full label visible at all
widths. (Approach chosen by the user over an icon-only-on-narrow alternative.)

## Change

Single file: [src/pages/Reports/components/ReportListItem.tsx](../../../src/pages/Reports/components/ReportListItem.tsx),
the "Add to Incident" `AggieButton` at lines ~205-226 (the `else` branch of the
`report._group && incident` check).

`white-space` is inherited, so the button's default `text-nowrap` propagates to
its text children. The robust fix (avoiding a Tailwind `text-nowrap` vs
`whitespace-normal` class-precedence conflict on the same element) is to let the
label wrap via a child span, mirroring the existing `groupSelection` branch which
already wraps its content in a centered `flex flex-col` span.

Specifically, in the non-`groupSelection` branch, replace the bare
`"Add to Incident"` string with a span that re-enables wrapping and centers:

```jsx
<span className='whitespace-normal text-center leading-tight'>
  Add to Incident
</span>
```

The button already has `justify-center items-center h-full` and `flex-grow`, so
centered wrapped text sits correctly. The leading `faPlus` icon (passed via the
`icon` prop) is unaffected.

Note: the `groupSelection` branch (lines ~213-222) already wraps and centers its
label in a `flex flex-col items-center leading-tight` span, so it does not
overflow. Only the plain-string branch needs the change. Optionally add
`whitespace-normal` to that existing inner span too for consistency, but it is
not required to fix the bug.

No change to `AggieButton` itself (its `text-nowrap` default is relied on
elsewhere and should stay).

## Verification

1. Run the app: `npm run dev` and open `https://localhost:8000`, go to the
   Reports/alerts list.
2. Find alert rows not yet attached to an incident (they show the dashed
   "Add to Incident" button in the right-hand column).
3. Narrow the browser window / use responsive dev tools at small widths
   (e.g. ~768px and below) and confirm the label wraps within its column and
   the button no longer overflows horizontally past the row.
4. Confirm the already-attached-incident rows (the `<Link>` branch) and the
   multi-select "(N selected)" variant still render correctly and remain within
   their column.
5. Verify light and dark mode both look correct.
