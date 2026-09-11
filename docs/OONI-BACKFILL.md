# Backfilling historical OONI alerts

Populates the `reports` collection with OONI connectivity alerts for a
historical date range, using the exact same alert logic the live
`OONIChannel` uses — so the result is indistinguishable from what would
exist if the channel had been running the whole time.

Two steps: generate a file locally, then import that file on the target
server.

## 1. Generate the alerts file

Run this wherever OONI's public API is reachable (your machine is fine —
it never touches any real/published database, it only writes a file):

```
node scripts/backfill/generate-ooni-alerts-jsonl.js [startDate] [endDate] [asns]
```

- `startDate` — defaults to `2025-12-01`
- `endDate` — defaults to today
- `asns` — comma-separated, defaults to `44244,58224`

Example (defaults are usually fine, so this is just `node scripts/backfill/generate-ooni-alerts-jsonl.js`):

```
node scripts/backfill/generate-ooni-alerts-jsonl.js 2025-12-01 2026-09-11 44244,58224
```

Output: `data/ooni-alerts-backfill.jsonl` (one JSON document per line).
Written incrementally, so if OONI's API rate-limits you partway through,
whatever ran so far is already saved — re-run with a later start date to
pick up where it left off.

## 2. Import the file into the target database

Copy `data/ooni-alerts-backfill.jsonl` onto the target server (Aggie Dev
or Production — wherever it needs to land), then **run this on that
server**, since it reads `DATABASE_URL` from that server's own `.env`
(same as the running app) — no connection string to type or share:

```
node scripts/backfill/import-ooni-alerts-jsonl.js [path-to-jsonl]
```

Defaults to `data/ooni-alerts-backfill.jsonl` if no path is given.

This is a `mongoimport`-free alternative (for servers without it
installed and no sudo to add it) — it uses the same MongoDB driver the
app already depends on via Mongoose to `insertMany` the documents
directly. It logs `Inserted: X, skipped: Y` when done — skipped means
those guids already existed (e.g. the live channel already created them),
which is expected and safe.

## Notes

- Guids are deterministic (`ooni:<asn>:<mode>:<date>`), matching what the
  live channel produces, so re-running generation or importing over a
  database that already has some of these alerts is safe — duplicates
  are skipped, not double-inserted.
- Safe to run any time — doesn't need to happen before/after any
  particular deploy. Re-run generation later with a later start date to
  pick up whatever came in after the last run.
- To sanity-check the generated alerts against what the live channel
  would have produced without touching the DB, see
  `scripts/backtest-ooni-alerts.js`.
