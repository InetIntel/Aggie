# Plan: Replace incident status filter with lifecycle-stage filter

## Context

The incidents list currently filters by an **Open / Closed / All** radio group (bound to the
`closed` boolean) — a carryover from Aggie's elections origins that no longer matches how the team
thinks about internet-outage incidents. Per [todo.md](./todo.md) ("instead of Open, Closed, All, and
'Show Only Escalated' change to Verification Stage, Confirmation Stage, Published"), we want the
filter to reflect the incident **lifecycle stages** instead:

- **Verification Stage** — measurement is still being verified
- **Confirmation Stage** — verified, now being confirmed
- **Published** — published (or shared with networks)

These stages already exist in the data model. The Group schema has `verification_status`
(`false|true|maybe`), `confirmation_status` (`false|true|maybe`), and `publication_status`
(array of `Not Published|Published|Shared with Networks`), and
[src/pages/incidents/IncidentStatuses.tsx](../../../src/pages/incidents/IncidentStatuses.tsx)
already derives a lifecycle badge from them. So this change is mostly a new **filter control** plus
**backend query support** — no schema changes.

### Decisions (confirmed with user)
- **Multi-select toggles** — the user can show any combination of stages at once (OR semantics).
- **Strict pipeline** stage definitions (mutually exclusive, matching the badge's precedence).
- **Default view = all stages, closed hidden.** No stage toggle selected → show all non-closed
  incidents. Closed incidents stay hidden by default, exposed via a separate "Include closed" toggle.

### Note on "Show Only Escalated"
There is **no** escalated control in the filter bar today (it's a stale concept in the todo notes).
The per-incident escalate toggle in the incident dropdown menu is unrelated and stays. So there is
nothing to remove for escalation — we only replace the Open/Closed/All radio.

### Out of scope
Status **display** badges (the table/list/compare "Open/Closed/In Progress" chips from
`statusFromGroup.ts` and the `IncidentOverallStatus` badge) are unchanged — this task only changes
the **filter**.

---

## Stage → query mapping (strict pipeline)

Mutually exclusive, following the badge precedence (publication wins over confirmation over verification):

| Stage | Mongo predicate |
|---|---|
| **Verification** | `verification_status ∈ {maybe}` AND `publication_status ∉ {Published, Shared with Networks}` |
| **Confirmation** | `verification_status ∈ {true}` AND `confirmation_status ∈ {maybe}` AND `publication_status ∉ {Published, Shared with Networks}` |
| **Published** | `publication_status ∈ {Published, Shared with Networks}` |

Predicates should be value-tolerant (the enum stores strings, but the frontend type also allows
booleans): match `{ $in: ['true', true] }` / `{ $in: ['maybe'] }` where relevant.

Terminal/side states (`Unable to Verify`, `Unable to Confirm`, `Confirmed-but-not-published`) fall
into **no** stage bucket by design — they still appear in the default "all" view but won't match a
selected stage. This is the intended strict-pipeline behavior.

---

## Changes

### Backend

**1. [backend/shared/group.js](../../../backend/shared/group.js) — add `stages` to `filterAttributes`** (line ~11-14).
Required so the controller's `_.pick(queryString, Group.filterAttributes)`
([groupController.js:741](../../../backend/api/controllers/groupController.js#L741))
doesn't drop the param before it reaches the model. `status` can stay listed (still ignored).

**2. [backend/models/group.js](../../../backend/models/group.js) — translate `stages` in `Group.queryGroups`** (after line 288, alongside the existing `delete filter.status`).
The generic loop at line 261-265 copies `query.stages` into `filter.stages`; translate it into real
predicates and delete the raw key, mirroring how `status` is handled:

```js
// Lifecycle-stage filter (multi-select, OR semantics)
const NOT_PUBLISHED = { publication_status: { $nin: ['Published', 'Shared with Networks'] } };
const stagePredicates = {
  verification: { verification_status: { $in: ['maybe'] }, ...NOT_PUBLISHED },
  confirmation: { verification_status: { $in: ['true', true] }, confirmation_status: { $in: ['maybe'] }, ...NOT_PUBLISHED },
  published:    { publication_status: { $in: ['Published', 'Shared with Networks'] } },
};
if (typeof query.stages === 'string' && query.stages.length) {
  const selected = query.stages.split(',').map(s => s.trim()).filter(s => stagePredicates[s]);
  if (selected.length) {
    // push as an $and clause so we don't clobber the assignedTo `$or` above
    filter.$and = (filter.$and || []).concat([{ $or: selected.map(s => stagePredicates[s]) }]);
  }
}
delete filter.stages;
```

Keep the existing `closed` handling exactly as-is (line 285-287): `filter.closed = false` by default,
`query.closed === 'all'` removes it. The frontend "Include closed" toggle reuses `closed=all`, so **no
backend change is needed for the closed behavior.**

### Frontend

**3. [src/api/groups/types.ts](../../../src/api/groups/types.ts) — extend `GroupQueryState`** (line 76-89).
Add `stages?: string;` (comma-separated stage keys). Keep `closed?`. Optionally drop `escalated?`
from the type only if unused elsewhere — verify with a usage search before removing; otherwise leave it.
`urlFromQuery` ([src/api/groups/index.ts:220-235](../../../src/api/groups/index.ts#L220-L235))
maps every key straight to the query string, so `stages` flows through with no change there.

**4. [src/pages/incidents/IncidentsFilters.tsx](../../../src/pages/incidents/IncidentsFilters.tsx) — replace the `FilterRadioGroup`** (lines 124-151) with:
- A **multi-select stage toggle set** (three pill buttons: Verification / Confirmation / Published).
  Read the current selection from `get("stages")` (comma-split), toggle a key on click, and call
  `setParams({ stages: next.join(",") || undefined })`. Reuse the pill styling from
  `FilterRadioGroup` (the `OptionStyle`/`OptionCheckedStyle` classes) for visual consistency —
  either inline `<button>` pills or a small new `FilterToggleGroup.tsx` in
  [src/components/filters/](../../../src/components/filters/) (there is no existing multi-select
  filter component; the siblings are radio/listbox/combobox only). A small reusable component is
  preferred and matches the folder's pattern.
- A separate **"Include closed"** checkbox → `setParams({ closed: checked ? "all" : undefined })`.
  This is the only way to surface closed incidents once the Open/Closed radio is gone.

**5. `setParams` title-search special-case** (IncidentsFilters.tsx lines 61-69).
Today title search forces `closed: "all"`. Keep that, and also clear the stage filter on search
(`stages: undefined`) so a title search spans all stages rather than being narrowed by an active toggle.

---

## Files touched (summary)
- `backend/shared/group.js` — add `stages` to `filterAttributes`
- `backend/models/group.js` — `stages` → predicates in `queryGroups`
- `src/api/groups/types.ts` — add `stages` to `GroupQueryState`
- `src/pages/incidents/IncidentsFilters.tsx` — new stage toggles + "Include closed" checkbox
- (optional) `src/components/filters/FilterToggleGroup.tsx` — small reusable multi-select control

## Verification
1. `npm run dev`, open `https://localhost:8000`, go to the Incidents list.
2. Default view: all non-closed incidents; no stage toggle active.
3. Toggle **Verification** — confirm the request is `GET /api/group?...&stages=verification` (DevTools
   Network) and results are limited to incidents whose badge reads "Verifying Measurement". Repeat for
   Confirmation ("Confirming") and Published ("Published"/"Shared with Networks").
4. Toggle two stages at once → results are the union of both (OR).
5. Check **Include closed** → previously-hidden closed incidents appear; unchecking hides them again.
6. Run a title search with a stage toggle active → search spans all stages + closed (toggle cleared).
7. Cross-check counts against the DB, e.g. in mongosh:
   `db.groups.countDocuments({ verification_status: 'maybe', publication_status: { $nin: ['Published','Shared with Networks'] }, closed: false, public: true })`.
