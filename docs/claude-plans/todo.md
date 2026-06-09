# TODO

Running list of notable behaviors and follow-ups to pick up later.

## `saveToDatabase` deletes attachments on every duplicate

**Status:** Notable behavior to review — not yet fixed.

### What

In the FETCH pipeline's save hook, [backend/fetching/hooks/saveToDatabase.js](../../backend/fetching/hooks/saveToDatabase.js),
the `catch` block runs `deleteSocialAttachments(report?.metadata?.attachments)` on **every** failed
`Report.create(...)` — including the very common case where the failure is a duplicate-key error.

```js
// saveToDatabase.js
const result = await Report.create(report);   // line 9
...
} catch (error) {
  await deleteSocialAttachments(report?.metadata?.attachments);   // line 16 — runs on EVERY failure
  console.error(`[Fetching-saveToDatabase] Failed - Failed saving reports: ${error.message}.`);
}
```

The duplicate case is frequent and expected: `report.js:28` declares a unique index on `guid`
(`guid: { type: String, index: true, unique: true }`), and the fetcher re-polls sources on a loop,
so any already-saved item is re-fetched and rejected with:

```
E11000 duplicate key error collection: aggie.reports index: guid_1 dup key: { guid: "..." }
```

### Why it's notable

- On each duplicate, line 16 deletes the **re-fetched** item's attachments
  (`report.metadata.attachments`). This is usually fine — they're freshly downloaded temp files for
  the rejected insert.
- **Risk:** if attachment storage paths are derived from `guid` (or otherwise shared with the
  already-saved report), deleting the duplicate's attachments could remove image files the existing,
  persisted report still references. Needs verification of how `deleteSocialAttachments` resolves
  paths and whether they collide with the stored report's attachments.
- Secondary: the duplicate is logged at `console.error`, which makes routine dedup look like a
  failure (noisy logs).

### Suggested fix (when picked up)

Special-case the duplicate-key error so dedup is treated as expected rather than a failure:

- Detect `error.code === 11000` (Mongo duplicate key).
- For that case: **skip** `deleteSocialAttachments` and skip (or downgrade to debug) the
  `console.error`, so we don't delete attachments for an item that already exists.
- Keep the current behavior (delete attachments + error log) only for genuine save failures.

### Files

- [backend/fetching/hooks/saveToDatabase.js](../../backend/fetching/hooks/saveToDatabase.js) — the hook
- [backend/models/report.js:28](../../backend/models/report.js#L28) — unique `guid` index
- `backend/fetching/utils/socialImageStorage.js` — `deleteSocialAttachments` (verify path resolution)

## general notes / fixes

- need to figure out which items in alerts and incidents are most important to users to prioritize as table resizes
