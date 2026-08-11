# Plan: Refreshing a dev sandbox from production (two approaches)

## Context

Aggie now runs as two deployments on two VMs, production and development. We want dev to hold real production data for realistic testing, with zero risk of dev ever updating or deleting prod data.

We evaluated keeping prod and dev in one shared MongoDB instance (either an `origin` field per record, or separate prod vs dev collections) and rejected it: a discriminator field means isolation depends on every query filtering correctly (one miss and dev reads or writes real prod data), and the separate-collections variant still requires regularly copying prod collections into dev collections, which is the same copy pattern with less isolation and less parity. The chosen model is a separate local MongoDB per VM with a one-way prod to dev refresh.

There are now two candidate mechanisms for that refresh, and this doc documents both:
- **Approach A:** logical dump/restore with `mongodump` / `mongorestore`.
- **Approach B:** ZFS snapshots with incremental `send`/`receive` (proposed by the systems engineer who owns the VM infra).

Neither requires any Aggie code changes.

## Shared model and decisions

- Separate local MongoDB on each VM (`mongodb://localhost:27017`). Each app only ever talks to its own DB, so dev physically cannot write to prod. Isolation is structural.
- One-way: prod is a read-only source; dev is the writable, disposable copy.
- Scope: copy everything (users, credentials, AES-encrypted keys). See "copy everything" requirements below.
- Dev fetching stays on.
- MongoDB major versions match across VMs.
- The refresh replaces dev's data. Dev-created data is transient and gets reset on each sync (accepted).
- Trigger: Approach A was scoped as a nightly cron; the systems engineer wants Approach B triggered manually. Either cadence works for either mechanism.

## Approach A: mongodump to mongorestore (logical refresh)

Script `ops/refresh-dev-from-prod.sh` on the dev VM. Order matters: dump prod first, and only stop and overwrite dev once the dump succeeds, so a failed dump never leaves dev wiped.

```bash
#!/usr/bin/env bash
set -euo pipefail
exec 9>/tmp/aggie-refresh.lock; flock -n 9 || exit 0     # no overlapping runs
WORK="$(mktemp -d)"; ARCHIVE="$WORK/prod.archive"
source "$HOME/.nvm/nvm.sh"; cd "$HOME/aggie"
cleanup(){ npx pm2 start aggie >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT                                         # always bring app back

# 1) Dump prod (pick ONE connection method):
#  A) SSH tunnel (prod Mongo stays localhost-only):
ssh -f -N -o ExitOnForwardFailure=yes -L 27018:127.0.0.1:27017 "$PROD_SSH"
mongodump --uri="mongodb://127.0.0.1:27018/aggie" --gzip --archive="$ARCHIVE"
#  B) Direct TLS + IP allowlist (read-only user):
#  mongodump --uri="mongodb://ro_dumper:${PW}@${PROD_HOST}:27017/aggie?tls=true&authSource=admin" --gzip --archive="$ARCHIVE"

npx pm2 stop aggie                                        # 2) pause dev writes/fetching
mongorestore --uri="mongodb://127.0.0.1:27017" --drop --gzip --archive="$ARCHIVE"   # 3) overwrite
# 4) trap restarts pm2 app 'aggie'
```

- `--drop` yields an exact mirror; indexes travel in the dump. Brief early-morning downtime is acceptable. Log and alert on failure.
- Connection: SSH tunnel keeps prod Mongo localhost-only (recommended); direct TLS + IP allowlist is the alternative. Use a read-only credential either way.

## Approach B: ZFS snapshots + incremental send/receive (infra proposal)

Operates at the storage layer beneath MongoDB, so Aggie is untouched.

Prerequisites:
- Both VMs run MongoDB's data directory on a ZFS dataset.
- Journaling enabled (default on modern MongoDB/WiredTiger), and data files plus journal on the **same** ZFS dataset so a snapshot is atomic and crash-consistent. (If journal were on a separate volume, briefly `fsyncLock` prod during the snapshot instead.)
- Root or delegated `zfs allow` for send/receive.

Flow (manual trigger):
```bash
# On prod: take a point-in-time snapshot
zfs snapshot tank/mongo@sync-2026-08-07

# Ship only the delta since the last synced snapshot, over SSH, into dev:
zfs send -i tank/mongo@sync-2026-08-06 tank/mongo@sync-2026-08-07 \
  | ssh dev-host "zfs receive -F tank/mongo"
#   first run is a full send:  zfs send tank/mongo@sync-... | ssh dev-host "zfs receive tank/mongo"

# On dev: mongod must be stopped during the receive; start it after.
#   WiredTiger replays its journal on startup and comes up clean.
```

- Incremental send moves only changed blocks, so cost stays roughly flat as the DB grows (the main advantage over dump/restore at scale).
- Snapshots are atomic (copy-on-write), so there is no torn-file risk and no prod shutdown.
- `receive -F` rolls dev's dataset back to match prod, discarding dev's local writes since the last sync. That is exactly the disposable-dev behavior we want. (Alternative: receive into a base dataset and `zfs clone` a fresh writable clone for dev's mongod each sync.)
- Dev's mongod is stopped during the receive (brief downtime, comparable to Approach A's restore window).

## Comparison

| Dimension | A: mongodump/mongorestore | B: ZFS snapshot send/receive |
|---|---|---|
| Aggie code changes | None | None |
| Setup / prerequisites | MongoDB tools + a DB user; any filesystem; no root | Both VMs on ZFS with Mongo data on a dataset; root or `zfs allow` |
| Scales with DB growth | Full dump + full restore + index rebuild each time; gets onerous | Incremental deltas only; near-constant cost |
| Prod impact | Reads all data through the query engine; evicts working set from RAM | Snapshot is instant; minimal impact |
| Consistency | Per-collection; `--oplog` for point-in-time | Atomic snapshot; needs journaling + same dataset |
| SSH fit | Tunnel or dump-then-copy over SSH | `send \| ssh receive` is the native idiom |
| Selective / anonymized copy | Yes (`--nsInclude/--nsExclude`, subset dumps) | No; whole dataset, all or nothing |
| Dev usable after sync | Immediately writable | Needs `receive -F` or a writable clone; stop mongod during receive |
| DB off the network | Yes (localhost/SSH) | Yes (localhost/SSH) |
| Writes to prod | Never (read-only) | Never (read-only source) |

## Recommendation

Given the systems engineer already owns the storage layer and DB growth is the stated concern, **ZFS incremental (Approach B) is the better primary**: it scales, it is atomic (which directly answers the earlier corruption worry), and its SSH piping is clean. **Keep `mongodump` (Approach A) documented as the simpler, storage-agnostic fallback**, and note it is the tool to reach for if we ever need selective or anonymized copies, since ZFS cannot filter or scrub at the collection level.

## Why neither is the `rsync` risk

The earlier concern (copying while prod is mid-write, held locks, needing to shut prod down) is specifically a file-level `rsync`/`cp` problem: those copy files non-atomically, so they require stopping writes or `fsyncLock`. Both approaches here avoid it. `mongodump` reads live through the query engine (no file copy at all). ZFS snapshots are atomic copy-on-write images (frozen at one instant, no tearing). Also worth stating: MongoDB locks are in-memory runtime constructs, never persisted into documents or data files, so no lock can be "copied over" and stick.

## "Copy everything" requirements on dev (applies to both approaches)

- **`ENCRYPTION_KEY` must equal prod's** in dev, or copied source credentials cannot be decrypted and (with dev fetching on) credentialed sources error. Consequence: prod's encryption key lives on the dev VM; secure it.
- **`MFA_REQUIRE_FOR_ENROLLED=false`** in dev: WebAuthn passkeys are bound to prod's `RP_ID`/`ORIGIN` and will not validate. Password login still works.
- `SECRET`/`JWT_SESSION` may differ (JWT login, no Mongo session store); users just log in fresh.
- Prod PII and secrets now sit on a lower-trust box; treat the dev VM accordingly.

## Dev fetching (kept on, applies to both)

Dev polls copied sources with real prod API keys, so it makes real API calls that share prod's rate limits and cost (consider a longer `API_FETCH_INTERVAL` or disabling noisy sources). Dev-fetched reports are replaced/rolled back at the next sync; no `guid` collision since the databases are separate.

## Verification (both approaches)

1. Run a sync manually: dev collection counts match prod, and a known prod document appears in dev.
2. Prod untouched: the read-only path cannot write; a prod document is byte-identical before and after a sync.
3. Reset semantics: create a test incident in dev, sync, confirm it is gone and dev mirrors prod.
4. Failure safety: a failed sync leaves dev usable (Approach A keeps yesterday's data via dump-first ordering; Approach B leaves the prior dataset intact until receive completes).
5. Auth: password login with a prod account works; MFA-enrolled users still get in.
6. Credentials: a credentialed source decrypts and fetches in dev (validates `ENCRYPTION_KEY`).
7. Consistency (Approach B): after a sync, dev's mongod starts clean (journal replay) with no repair needed.

## References

- MongoDB: [Backup Methods](https://www.mongodb.com/docs/manual/core/backups/), [Filesystem Snapshots](https://www.mongodb.com/docs/manual/tutorial/backup-with-filesystem-snapshots/), [`db.fsyncLock()`](https://www.mongodb.com/docs/manual/reference/method/db.fsynclock/), [Back Up and Restore with Tools](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/), [`mongodump`](https://www.mongodb.com/docs/database-tools/mongodump/).
- Separate environments / shared-DB anti-pattern: [Redgate: unnecessary evil of the shared dev database](https://www.red-gate.com/simple-talk/databases/sql-server/tools-sql-server/the-unnecessary-evil-of-the-shared-development-database/), [Redgate: architecting dev/test environments](https://www.red-gate.com/blog/architecting-database-dev-and-test-environments-best-practices-and-anti-patterns-for-sql-server/), [Ben Morris: shared database anti-pattern](https://www.ben-morris.com/a-shared-database-is-still-an-anti-pattern-no-matter-what-the-justification/), [AWS: shared-database anti-pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-data-persistence/shared-database.html).
- Refreshing lower environments from prod: [SAP Community](https://community.sap.com/t5/human-capital-management-blog-posts-by-sap/refreshing-lower-environment-with-production-data-process-for-apme/ba-p/13553611), [Microsoft Dynamics 365 blog](https://www.microsoft.com/en-us/dynamics-365/blog/no-audience/2009/12/23/best-practices-for-refreshing-a-microsoft-dynamics-crm-test-environment/).
