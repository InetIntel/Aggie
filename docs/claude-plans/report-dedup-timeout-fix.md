# Fix: 60s timeout on `GET /api/report` deduplicated alerts query

## Context

The alerts table suddenly started returning **HTTP 500** with backend log
`Timeout has occurred, request cannot be processed` for requests like:

```
GET /api/report?irrelevant=all&entityLevel=Region,AS - Region,AS - Country,AS&hideDuplicateASNs=true&alerts=true
```

Restarting the backend doesn't help because the problem is query cost, not process state.

**Root cause:** `hideDuplicateASNs=true` routes the request to `Report.queryReportsDeduped`
([backend/models/report.js:264-342](../../backend/models/report.js#L264-L342)), which builds the
pagination `total` via an **unbounded** aggregation
(`$match` → `$group` by `eventIdentifier` → `$count`) over the *entire* matching set on every
request. The filter matches on `metadata.rawAPIResponse.entityLevel`
([report-query.js:133-145](../../backend/models/query/report-query.js#L133-L145)) — a nested field
of a `Schema.Types.Mixed` column with **no index** — plus `isOutageEvent`. Both the `find` and the
`$group` do full collection scans. On the now-large outage-events collection this exceeds the
`API_REQUEST_TIMEOUT=60000` (60s) enforced by `handleRequestTimeouts`
([api.js:118-144](../../backend/api.js#L118-L144), wired at [api.js:166](../../backend/api.js#L166)),
which returns a bare 500. This path was added on this branch in commit `4f66ac4d`, which is why it
appeared "suddenly" — the alerts table now always sends `hideDuplicateASNs=true`.

DB is **MongoDB Atlas** (`mongodb+srv://…`), so index builds are non-blocking rolling builds.

**Out of scope:** the `E11000 dup key { guid }` fetching log is benign (the fetcher re-receiving an
already-stored report; attachments are keyed by a unique download token, not the guid, so nothing is
wrongly deleted). Not addressed here.

## Intended outcome

The deduplicated alerts query returns in well under the 60s budget by (1) adding compound indexes so
both the find and the dedup count are index-backed, and (2) removing a redundant predicate that
blocks index use and bounding the cost of the per-request count.

---

## Step 1 — Build the two compound indexes on Atlas now (immediate unblock)

Run via `mongosh` against the cluster (or Atlas UI → Indexes). Key specs must match the schema
declarations in Step 2 **exactly** (same field order + direction) or Mongoose will try to build
duplicates.

```js
// (a) filtered + sorted find(): isOutageEvent + entityLevel equality, sort authoredAt desc
db.reports.createIndex(
  { isOutageEvent: 1, "metadata.rawAPIResponse.entityLevel": 1, authoredAt: -1 },
  { background: true }
);
// (b) dedup count aggregation: $match(isOutageEvent + entityLevel) then $group by eventIdentifier
db.reports.createIndex(
  { isOutageEvent: 1, "metadata.rawAPIResponse.entityLevel": 1, eventIdentifier: 1 },
  { background: true }
);
```

Watch progress with `db.currentOp()` or the Atlas index-build view. Once these exist, the existing
query already speeds up dramatically with no code deploy (index usage is automatic). This alone
should bring the request back under 60s.

ESR rationale: equality on `isOutageEvent` + `metadata.rawAPIResponse.entityLevel`, then sort
(`authoredAt`) for (a); trailing `eventIdentifier` lets the `$group` be served from index (b).
Indexing a dotted path into a Mixed field is valid; docs missing the field index with a null key,
which is fine. Index (b) must **not** be sparse — the `$cond` group key falls back to `$_id` for
docs lacking `eventIdentifier`, so all matching docs must be indexed.

## Step 2 — Add the index declarations to the schema (so restarts/install keep them)

In [backend/models/report.js](../../backend/models/report.js), immediately after the existing index
block (after line 68), add (Mongoose 5 syntax, `background: true`):

```js
schema.index(
  { isOutageEvent: 1, 'metadata.rawAPIResponse.entityLevel': 1, authoredAt: -1 },
  { background: true }
);
schema.index(
  { isOutageEvent: 1, 'metadata.rawAPIResponse.entityLevel': 1, eventIdentifier: 1 },
  { background: true }
);
```

Because Step 1 already built them on Atlas, the `autoIndex`/`Report.ensureIndexes` run on next
restart ([install.js:24-30](../../install.js#L24-L30)) is a no-op for these — it only builds what's
missing.

## Step 3 — Drop the redundant `$exists` predicate that blocks index use

In [report-query.js:133-145](../../backend/models/query/report-query.js#L133-L145), the
`entityLevel` block pushes a separate `{ "metadata.rawAPIResponse.entityLevel": { $exists: true } }`
clause that is implied by the `$in`/equality clause and degrades plan selection. Simplify to just the
value clause:

```js
if (this.entityLevel && this.entityLevel.length > 0) {
  const entityLevelFilter =
    this.entityLevel.length === 1
      ? this.entityLevel[0]
      : { $in: this.entityLevel };

  filter.$and = [
    ...(filter.$and || []),
    { 'metadata.rawAPIResponse.entityLevel': entityLevelFilter },
  ];
}
```

Apply the same redundant-`$exists` removal to the `dataSources` block just above
([report-query.js:126-132](../../backend/models/query/report-query.js#L126-L132)) for consistency.

## Step 4 — Bound the dedup count aggregation

In [report.js:314-332](../../backend/models/report.js#L314-L332):

- Add `.allowDiskUse(true)` to the `Report.aggregate(...)` call as a safety net against the 100MB
  in-memory group limit.

Leave the dedup **result-set** logic
([report.js:284-312](../../backend/models/report.js#L284-L312)) untouched — the
`rawFetchLimit = targetUnique * 2` heuristic and `Set`-based dedup are correct and become
index-friendly via index (a).

> Note: with indexes (a)/(b) and the `$exists` removal, the count becomes index-backed and should be
> well under budget. A page-0-only / short-TTL-cached count was considered to bound growth further
> but is deferred — revisit only if profiling shows the index-backed group is still slow.

---

## Verification

1. **Confirm indexes exist & are used:** in `mongosh`, `db.reports.getIndexes()` shows both new
   indexes; run the production filter through
   `db.reports.find(<filter>).sort({authoredAt:-1}).explain("executionStats")` and the count
   aggregation with `.explain()` — expect `IXSCAN` (not `COLLSCAN`) and low `totalDocsExamined`.
2. **End-to-end:** with `npm run dev`, load the alerts table (the request that was 500ing). Expect a
   2xx with results + correct `total`, returning in a few hundred ms rather than timing out.
3. **Regression:** load the alerts table with `hideDuplicateASNs=false` and with a `groupId` filter
   (non-dedup path via `Report.queryReports`) to confirm those still work.
4. **No duplicate indexes:** restart the backend and confirm `ensureIndexes` doesn't rebuild — the
   schema specs match the Atlas-built indexes exactly.

## Files to modify

- [backend/models/report.js](../../backend/models/report.js) — add two `schema.index(...)`
  (after L68); `.allowDiskUse(true)` on the aggregation (L314).
- [backend/models/query/report-query.js](../../backend/models/query/report-query.js) — remove
  redundant `$exists` clauses (L126-132, L133-145).
- Atlas (operational, no code) — build the two indexes via `mongosh`.
