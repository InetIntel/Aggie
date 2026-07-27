# Fix: "Cannot use 'in' operator to search for 'username'" when assigning a user to an incident

## Context

Assigning a user to an incident (editing an incident via `CreateEditIncidentForm`) throws:

```
TypeError: Cannot use 'in' operator to search for 'username' in 698e28f74850490bfe96dabd
```

The crash is the JS `in` operator being applied to a string (a Mongo ObjectId) instead of a user object. It fires in the new table view's `formatAssignedTo`:

[src/pages/incidents/TableView/IncidentsTable.tsx](../../src/pages/incidents/TableView/IncidentsTable.tsx) (lines ~38-44)
```ts
.map((u) => ("username" in u && u.username) || "")  // u is a string id → throws
```

### Root cause

`Group.assignedTo` is normally a populated array of `{ _id, username }` objects (what the API returns and the cache holds after load). But the edit-incident form stores `assignedTo` as `string[]` of user ids ([CreateEditIncidentForm.tsx:82](../../src/pages/incidents/CreateEditIncidentForm.tsx#L82), and `GroupEditableData.assignedTo: string[]` in [types.ts:61](../../src/api/groups/types.ts#L61)).

On save, `doUpdate.onSuccess` does an optimistic cache update that **spreads the raw form variables** over the cached group:

[src/pages/incidents/useIncidentMutations.ts:31-39](../../src/pages/incidents/useIncidentMutations.ts#L31)
```ts
results: updateByIds([variables._id], data.results, { ...variables })  // assignedTo becomes string[]
```

This overwrites the populated user objects with bare id strings. The table then re-renders against the corrupted cache and `formatAssignedTo` crashes (`onSettled` invalidates and refetches, but the synchronous re-render crashes first).

There is already a correct pattern for this in the same file: `doSetAssign.onSuccess` ([useIncidentMutations.ts:88-109](../../src/pages/incidents/useIncidentMutations.ts#L88)) resolves each id back to a full user object using the `users` query that the hook already loads. And `IncidentListItem` already has a defensive `getUserId` using lodash `isString` ([IncidentListItem.tsx:104-108](../../src/pages/incidents/IncidentListItem.tsx#L104)).

## Fix

Two changes — fix the source of the bad data, and harden the renderer against it.

### 1. Resolve ids → user objects in `doUpdate` (root cause)

In [src/pages/incidents/useIncidentMutations.ts](../../src/pages/incidents/useIncidentMutations.ts), make `doUpdate.onSuccess` resolve `variables.assignedTo` (string ids) into populated user objects before writing to the cache — mirroring the existing `doSetAssign` logic that already uses the `users` query loaded at the top of the hook. Concretely, in the optimistic update spread `{ ...variables }` but override `assignedTo` with the resolved objects:

```ts
const resolvedAssignedTo = variables.assignedTo?.map((id) =>
  users?.find((u) => u._id === id) ?? { _id: "", username: "User not found" }
);
return {
  results: updateByIds([variables._id], data.results, {
    ...variables,
    ...(resolvedAssignedTo ? { assignedTo: resolvedAssignedTo } : {}),
  }),
};
```

This keeps `assignedTo` shaped as `{ _id, username }[]` in the cache, consistent with what the API returns and what every consumer expects.

### 2. Harden `formatAssignedTo` (defense in depth)

In [src/pages/incidents/TableView/IncidentsTable.tsx](../../src/pages/incidents/TableView/IncidentsTable.tsx), make `formatAssignedTo` tolerate string entries instead of assuming objects, reusing the same `isString` approach as `IncidentListItem.getUserId`:

```ts
import { isString } from "lodash";

const formatAssignedTo = (group: Group) => {
  if (!group.assignedTo || group.assignedTo.length === 0) return null;
  return group.assignedTo
    .map((u) => (isString(u) ? "" : u.username || ""))
    .filter(Boolean)
    .join(", ");
};
```

(A string id has no username to display, so it maps to `""` and is filtered out — no crash. Once fix #1 lands, entries will be objects anyway; this just guarantees the table never throws on a stray id from any other code path.)

## Files to modify

- [src/pages/incidents/useIncidentMutations.ts](../../src/pages/incidents/useIncidentMutations.ts) — `doUpdate.onSuccess`: resolve `assignedTo` ids to user objects (reuse the existing `users` query + the `doSetAssign` pattern).
- [src/pages/incidents/TableView/IncidentsTable.tsx](../../src/pages/incidents/TableView/IncidentsTable.tsx) — `formatAssignedTo`: guard against string entries via lodash `isString`.

No type or API changes needed.

## Verification

- `npm run dev`, open `https://localhost:8000/incidents?view=table`.
- Click the pencil (edit) on an incident, assign one or more users, Update. Confirm:
  - No "Cannot use 'in' operator" error.
  - The Assigned To column shows the chosen usernames immediately (optimistic), and still correct after the background refetch.
- Repeat in list view (assign via the existing affordance) to confirm no regression.
- Edit an incident and assign **zero** users (clear assignment) — Assigned To shows `—`, no crash.
- `npx tsc --noEmit` clean.
