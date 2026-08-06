# Plan: Dev sandbox via nightly prod→dev database refresh

## Context

Aggie now runs as **two deployments on two VMs** — production and development — and we want dev to contain **real production data** for realistic testing, with **zero risk** of dev ever updating or deleting prod data.

After weighing alternatives (a shared/dedicated DB VM; per-record `origin` tagging with query scoping; app-level collection unions), the chosen approach is the simplest and safest: **each VM runs its own local MongoDB, and a cron job on the dev VM overwrites dev's database with a fresh copy of prod's every morning.** No application code changes, no `origin` field (it only earned its keep in merge/preserve designs; a full overwrite makes it unnecessary and sidesteps the legacy-data problem), and local-vs-local DB access stays identical across both environments — maximum parity.

**Decisions (user):**
1. **Transport:** dev pulls directly via `mongodump` against prod. *Connection method still open — this plan specs both an SSH tunnel (recommended) and direct TLS+allowlist.*
2. **Scope:** copy **everything** (full fidelity — users, credentials, encrypted keys included).
3. **Dev fetching:** **keep** dev's fetching pipeline running.
4. **Mongo versions match** across VMs, so `mongodump`/`mongorestore` are safe as-is.

**Accepted consequence:** the refresh is an *overwrite* — anything created in dev is wiped every morning. Dev is a disposable, clean-slate-daily sandbox.

## Architecture

```
   PROD VM                                  DEV VM
  ┌──────────────────┐                     ┌──────────────────┐
  │ Aggie (prod)     │                     │ Aggie (dev)      │
  │  └─ local Mongo  │◀─── mongodump ──────│  cron (nightly)  │
  │     localhost    │   (read-only pull)  │  ├─ dump prod    │
  │     :27017       │                     │  ├─ stop aggie   │
  └──────────────────┘                     │  ├─ restore--drop│
   app ↔ localhost                         │  └─ start aggie  │
                                           │     local Mongo  │
                                           └──────────────────┘
```

Each app only ever talks to **its own local MongoDB** — there is no code path by which dev can write to prod. The only cross-VM link is the nightly dump, which **reads** prod and **writes** dev. Isolation is physical, not enforced by app logic.

## The refresh job (cron on the dev VM)

New script `ops/refresh-dev-from-prod.sh`, scheduled ~nightly (e.g. 3am) via the dev user's crontab. Ordering is deliberate: **dump prod first; only stop+overwrite dev once the dump succeeds**, so a failed dump never leaves dev wiped.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Prevent overlapping runs
exec 9>/tmp/aggie-refresh.lock; flock -n 9 || { echo "refresh already running"; exit 0; }

WORK="$(mktemp -d)"; ARCHIVE="$WORK/prod.archive"
source "$HOME/.nvm/nvm.sh"; cd "$HOME/aggie"

cleanup() { npx pm2 start aggie >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT   # always bring the app back, even on error

# 1) Dump prod  --- pick ONE connection method (see below) ---
#  A) SSH tunnel (recommended): prod Mongo stays localhost-only
ssh -f -N -o ExitOnForwardFailure=yes -L 27018:127.0.0.1:27017 "$PROD_SSH"
mongodump --uri="mongodb://127.0.0.1:27018/aggie" --gzip --archive="$ARCHIVE"
#  B) Direct TLS + IP allowlist (alternative):
#  mongodump --uri="mongodb://ro_dumper:${PROD_RO_PW}@${PROD_HOST}:27017/aggie?tls=true&authSource=admin" \
#            --gzip --archive="$ARCHIVE"

# 2) Pause dev app so fetching/writes don't race the restore
npx pm2 stop aggie

# 3) Overwrite local dev DB with the prod snapshot (indexes travel in the dump)
mongorestore --uri="mongodb://127.0.0.1:27017" --drop --gzip --archive="$ARCHIVE"

# 4) trap runs cleanup() -> pm2 start aggie
```

Notes:
- `--drop` drops each collection just before reloading it → an exact mirror of prod (no dev-only collections exist in this design). `--gzip --archive` keeps it to a single file; add `--numParallelCollections=N` if the window needs shrinking on a large `reports` collection.
- **Brief downtime** during the restore is acceptable for a sandbox; early-morning timing minimizes impact. (Zero-downtime — restore to a temp DB then swap — is possible later but overkill now.)
- Log start/end/exit status to a file and alert on failure, so a stale or partial dev DB is noticed.
- Cron line mirrors the repo's existing pattern: `0 3 * * * bash -lc '"$HOME/aggie/ops/refresh-dev-from-prod.sh" >> "$HOME/refresh-dev.log" 2>&1'`.

## Connection method — to finalize

- **SSH tunnel (recommended):** dev opens an SSH tunnel to the prod VM and dumps against `127.0.0.1` through it. **Prod Mongo never has to listen on the network** — it stays localhost-only as it is today. Reuses existing SSH keys/access; minimal prod-side change. Prereq: an SSH identity on dev that can reach prod (ideally a restricted deploy user).
- **Direct TLS + IP allowlist:** enable TLS + auth on prod's mongod, expose it on its interface, firewall it to only the dev VM's IP, and create a **read-only** Mongo user for the dump. More prod-side config and a managed open DB port, but no SSH dependency.

Either way, prefer a **read-only** credential/user for the dump so the pull path is incapable of modifying prod, on top of the physical separation.

## What "copy everything" requires on the dev side

The dump includes prod users, OAuth-flow sessions, and AES-encrypted credentials, so a few dev settings must line up or the copied data won't be usable:

- **`ENCRYPTION_KEY` must equal prod's** in dev — otherwise the copied source credentials can't be decrypted, and (since dev fetching is on) every credentialed source errors. Consequence: **prod's encryption key now lives on the dev VM** — secure the dev VM (disk, SSH, backups) accordingly.
- **WebAuthn/passkeys won't carry over** — they're bound to prod's `RP_ID`/`ORIGIN`. Set **`MFA_REQUIRE_FOR_ENROLLED=false`** in dev so MFA-enrolled prod users aren't locked out. Password login still works (passport-local-mongoose hashes are self-contained in the user doc, independent of `SECRET`).
- **`SECRET`/`JWT_SESSION` may differ** — login is JWT-based with no Mongo session store, so copied cookies simply won't validate; users log in fresh. No action needed.
- **PII/secrets now sit on a lower-trust box** — the dev VM effectively becomes prod-secret-sensitive.

## Dev fetching (kept on)

Dev's FETCH process polls the copied sources with the **real prod API keys**, so:
- Dev makes **real API calls** on the same keys as prod — it consumes shared rate limits / cost. Consider a longer `API_FETCH_INTERVAL` in dev or disabling the noisiest sources if limits bite.
- Reports dev fetches during the day accumulate locally and are replaced at the next refresh — no `guid` collision with prod (separate databases).

## Verification

1. **Refresh works:** run the script manually; dev collection counts match prod, and a known prod document appears in dev.
2. **Prod untouched:** the dump credential/tunnel cannot write (attempt an insert → denied); diff a prod document before/after a refresh — identical.
3. **Overwrite semantics:** create a test incident in dev, run the refresh, confirm it's gone and dev mirrors prod.
4. **Failure safety:** simulate a failed dump (bad host) → dev keeps yesterday's data and the app is still running (trap restarts it).
5. **Auth:** log into dev with a prod account via password; MFA-enrolled users still get in (`MFA_REQUIRE_FOR_ENROLLED=false`).
6. **Credentials/fetching:** a credentialed source decrypts and fetches in dev (validates `ENCRYPTION_KEY` parity).
7. **Schedule + alerting:** cron fires at the set time; a failed/partial refresh raises an alert.

## Prerequisites / to confirm on the infra side

- Decide the connection method (SSH tunnel vs direct TLS) and provision the corresponding access (SSH identity or RO Mongo user + firewall/TLS).
- Enough disk on the dev VM for the gzip archive **plus** the restored data.
- The dev VM's crontab runs as the `aggie` deploy user with nvm available (matches existing crons in `SCRIPTS.md`).
- Confirm prod Mongo auth state (currently localhost-only per the runbook) and whether TLS/CA is needed for the chosen method.

## Out of scope / notes

- **No application code changes** — entirely ops (cron + `mongodump`/`mongorestore`) plus dev env-var alignment.
- If prod secrets on the dev VM later become a concern, the natural evolution is switching Scope to exclude/anonymize `users` + `credentials` via `--nsExclude` on the dump — deferred by choice.
