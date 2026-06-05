# Incidents Table View

A second view for the Incidents page, alongside the existing list view. Same `Group` data, rendered as a sortable-feeling, density-tuned table with progressive column hiding as the viewport narrows.

## Files

- [src/pages/incidents/index.tsx](../../src/pages/incidents/index.tsx) — hosts the `view` URL param (`list` | `table`) and the segmented toggle in the page header. Renders either the existing list block or `<IncidentsTable>`.
- [src/pages/incidents/TableView/IncidentsTable.tsx](../../src/pages/incidents/TableView/IncidentsTable.tsx) — the table itself.
- [src/pages/incidents/TableView/AsnChips.tsx](../../src/pages/incidents/TableView/AsnChips.tsx) — renders `Group.impactedAsns` as teal chips with `+N` overflow.
- [src/pages/incidents/TableView/statusFromGroup.ts](../../src/pages/incidents/TableView/statusFromGroup.ts) — derives `"Open" | "Closed" | "In Progress"` from a `Group`.

Page-local per the CLAUDE.md folder convention. `IncidentsFilters`, `Pagination`, and the refresh / Create buttons stay in [index.tsx](../../src/pages/incidents/index.tsx) — they wrap whichever view is active.

## Data → columns

Each row is a `Group` from `GET /api/groups` (typed in [src/api/groups/types.ts](../../src/api/groups/types.ts)). React key is `_id`.

| #   | Column         | Displayed value                                                  | Source on `Group`                                                                           |
| --- | -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | ID#            | `#1234`                                                          | `idnum`                                                                                     |
| 2   | Incident Title | Title link to `/incidents/:_id` + "N reports" subline            | `title`, `_reports.length`                                                                  |
| 3   | Start Date     | Date on line 1, time on line 2 (`YYYY-MM-DD` / `HH:MM` from ISO) | `incidentStartedAt`                                                                         |
| 4   | Status         | `Open` \| `Closed` \| `In Progress`                              | derived in `statusFromGroup` from `closed` + `escalated`                                    |
| 5   | Alerts Report  | Red bold count + "alerts" suffix when > 0; grey "0" otherwise    | `_reports.length`                                                                           |
| 6   | ASNs Impacted  | Up to 6 teal chips, then `+N` overflow chip                      | `impactedAsns`                                                                              |
| 7   | Assigned To    | Comma-joined usernames, or `—`                                   | `assignedTo[].username`                                                                     |
| 8   | More Info      | "View" / "Hide" toggle that expands an inline detail row         | `notes`, `locationName` + any currently-hidden columns                                      |
| 9   | Actions        | Pencil (edit dialog) + Trash (confirm → delete)                  | mutations from [useIncidentMutations.ts](../../src/pages/incidents/useIncidentMutations.ts) |

Status derivation: `closed=true → "Closed"`; `escalated=true && !closed → "In Progress"`; else `"Open"`.

## Responsive collapse

Tailwind v3 default breakpoints. Full 9-column table at `xl` (≥ 1280 px).

| Width           | New columns revealed                  | Total visible |
| --------------- | ------------------------------------- | ------------- |
| `< 768`         | ID, Title, Status, More Info, Actions | 5             |
| `≥ 768` (`md`)  | + Start Date                          | 6             |
| `≥ 1024` (`lg`) | + ASNs Impacted                       | 7             |
| `≥ 1280` (`xl`) | + Alerts Report, Assigned To          | 9             |

**More Info is always visible** and acts as the spillover surface: the expanded panel always renders `notes` + `locationName`, plus blocks for each column hidden at the current breakpoint. Each block uses the inverse responsive class (`md:hidden`, `lg:hidden`, `xl:hidden`), so at `xl+` the panel collapses to just notes + location.

Priority rationale:

- Alerts Report is lowest priority — the same count appears in the Title subline.
- ASNs Impacted holds the longest (down to `lg`) because chips are the table's main value-add.
- Assigned To pairs with Alerts Report at `xl`.

## Layout

The table uses **auto layout** (default; no `table-fixed`) with `w-full` on the `<table>`.

Why not `table-fixed`: it was tried and the Title column wouldn't absorb leftover space reliably under Chromium, even with `w-full` on the cell — the unallocated space leaked out as a phantom band on the right of the table. With auto layout the browser sizes columns to content needs, and the surplus width is naturally distributed to the column with the most text (Title), which is the desired behavior.

Other column cells keep their `w-XX` classes as preferred-width hints. Every header cell uses `whitespace-nowrap` so headers never wrap; Title `<th>` has `pr-4` for breathing room next to Start Date. Title `<td>` deliberately omits `whitespace-nowrap` so long row titles can wrap.

### Density

- Cell padding `px-2 py-2`.
- Subline text `text-[12px]`.
- ASN chips `px-1.5 py-0`, container `max-w-[160px]`.

## Per-row actions

- **Pencil** → opens `CreateEditIncidentForm` inside `AggieDialog`, wired to `useIncidentMutations().doUpdate`.
- **Trash** → opens `ConfirmationDialog`, wired to `useIncidentMutations().doRemove`.
- No bulk selection / no header checkbox — per-row only.

## View toggle

`view` is a URL param via `useQueryParams` (`?view=table` survives reload, consistent with the scroll-retention work in [index.tsx](../../src/pages/incidents/index.tsx)). The toggle is a small segmented control of two `AggieButton`s in the page header next to the refresh button.

## Future-tweak hooks

- Move columns between breakpoint buckets — single class change on both `<th>` and `<td>`.
- `AsnChips` `max` prop (default 6) and container `max-w-[160px]`.
- Bump the "all visible" threshold to `2xl` (1536 px) if `xl` feels cramped.
- If long titles ever blow up the column under auto-layout, the next step is `break-words` or `max-w-[...]` on the Title `<td>`.

## Open follow-ups

- Status column header overlaps the title around ~600 px width — unresolved.
- "N reports" subline text is very small; bump size.
- Populate real incident data end-to-end so the table isn't rendering against placeholder rows.
- Reports table — defer; ship Incidents first, then derive a sister `src/pages/Reports/TableView/`.
- Comparison modal — next feature after this view stabilises.
- Table totally deleted in table view when 0 incidents. Table structure + header should still exist.
