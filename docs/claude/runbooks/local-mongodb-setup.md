# Set up a local MongoDB for Aggie dev (macOS)

Runbook for running Aggie against a **local MongoDB 7.x** instead of the shared Atlas cluster. Local disk is effectively unlimited, so the 512 MB Atlas cap stops being a factor and you can wipe/recreate the DB anytime. Copy the sections below into Notion.

> Written for **macOS on Apple Silicon (arm64)**. Assumes Homebrew is installed. MongoDB pinned to **7.x** (Aggie requires MongoDB ≥ 7.0).

---

## Prerequisites

- Homebrew installed, and it should be the **native arm64** build (prefix `/opt/homebrew`). Check:
  ```bash
  which brew          # want: /opt/homebrew/bin/brew   (NOT /usr/local/bin/brew)
  brew config | grep -i rosetta   # want: Rosetta 2: false
  ```
  If `brew` lives in `/usr/local` (Intel build under Rosetta), migrate to arm64 first — see **Troubleshooting → Migrate Homebrew to arm64**.
- Xcode Command Line Tools present (Homebrew on macOS Sequoia requires them). Check:
  ```bash
  pkgutil --pkg-info=com.apple.pkg.CLTools_Executables >/dev/null 2>&1 && echo "CLT installed" || echo "CLT missing"
  ```
  If missing: `xcode-select --install` and complete the GUI popup.

---

## 1. Install & start MongoDB 7.0 (Homebrew)

```bash
brew tap mongodb/brew
brew trust mongodb/brew                 # newer Homebrew requires trusting 3rd-party taps
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

- Listens on `mongodb://localhost:27017`.
- `brew services` runs it as a background daemon that **auto-restarts on reboot**.

Verify it's up:
```bash
mongosh --eval 'db.runCommand({ping:1})'   # expect: { ok: 1 }
```

> If `brew tap` fails with `unknown option 'end-of-options'`, see **Troubleshooting → Old git shadows Homebrew's git**.

Handy service commands:
```bash
brew services list                          # status
brew services restart mongodb-community@7.0
brew services stop mongodb-community@7.0
```

---

## 2. Point Aggie's `.env` at local Mongo

In the Aggie repo's `.env`, comment out the Atlas string (keep it for switch-back) and set local:
```
# Atlas (shared, 512MB cap) — kept for reference / switch-back:
# DATABASE_URL=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?appName=...
DATABASE_URL=mongodb://localhost:27017
DATABASE_NAME=aggie
```

Why this works: Aggie's `backend/database.js` uses `DATABASE_URL` as the connection string and passes `DATABASE_NAME` as the `dbName`, so a bare host + `DATABASE_NAME=aggie` is correct. `DATABASE_URL` must be present (the app throws if it's unset). `.env` is gitignored — no commit involved.

---

## 3. Seed the empty local DB (admin user + indexes)

The local `aggie` DB starts empty. Create the admin account and Report indexes with Aggie's existing installer (reads `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`):
```bash
node install.js
```
This is the same script that runs as `postinstall`. Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.

---

## 4. (Optional) Seed with real cloud data instead of an empty DB

To develop against realistic data, copy the Atlas `aggie` DB down into local. This is **read-only** against Atlas — it doesn't change anything in the cloud. Skip step 3 if you do this (the dump already contains the users + indexes).

```bash
# Use your Atlas connection string (from the old DATABASE_URL) for <ATLAS_URI>.
# 1. Dump the cloud aggie DB to a compressed archive
mongodump --uri="<ATLAS_URI>" --db=aggie --gzip --archive=/tmp/atlas-aggie.archive

# 2. Restore into local, replacing any existing local collections
mongorestore --uri="mongodb://localhost:27017" --gzip --archive=/tmp/atlas-aggie.archive --drop

# 3. Delete the archive when done (it contains a full copy of the data, incl. credentials)
rm -f /tmp/atlas-aggie.archive
```

Notes:
- `mongodump` / `mongorestore` ship with `mongodb-database-tools` (installed as a dependency of `mongodb-community`).
- `--drop` makes local an exact mirror of cloud, so **your login becomes the cloud admin's credentials**, not whatever is in your local `.env`. To reset to a local admin: `mongosh aggie --eval 'db.users.drop()'` then `node install.js`.
- Source `credentials` are encrypted with `ENCRYPTION_KEY`. Live fetching from those sources only works if your local `.env` `ENCRYPTION_KEY` matches the key they were encrypted with.

---

## Verify end-to-end

```bash
# App connects locally, not Atlas
npm run dev:backend          # expect "Mongoose connection open to database." and NO Atlas host in logs

# Data is in local Mongo
mongosh aggie --eval 'db.reports.countDocuments()'
mongosh aggie --eval 'db.stats().dataSize'      # grows freely, no 512MB ceiling
```
Then `npm run dev`, log in at `https://localhost:8000`, enable a source, and confirm new reports appear.

---

## Reset / switch back

```bash
# Wipe local DB and re-seed from scratch
mongosh aggie --eval 'db.dropDatabase()' && node install.js

# Switch back to Atlas: re-comment the local line and uncomment the Atlas DATABASE_URL in .env
```

---

## Troubleshooting

**`mongosh: command not found` in a script/non-login shell** — the Homebrew bin isn't on PATH there. Use the full path `/opt/homebrew/bin/mongosh`, or add `eval "$(/opt/homebrew/bin/brew shellenv)"` to `~/.zprofile`.

**Old git shadows Homebrew's git — `brew tap` fails: `error: unknown option 'end-of-options'`** — an old standalone git (e.g. `/usr/local/git` → git 2.19.x) is shadowing your modern git, and Homebrew's clone needs git ≥ 2.24. Fixes:
```bash
# Quick, per-session:
export HOMEBREW_GIT_PATH=/usr/bin/git      # /usr/bin/git is Apple's modern git
# Permanent — pick one:
brew install git                            # puts a current git in /opt/homebrew/bin (ahead in PATH)
# or remove the stale standalone install:
sudo rm -rf /usr/local/git /usr/local/bin/git
```

**`brew install` fails: `Xcode alone is not sufficient on Sequoia … Install the Command Line Tools`** — install CLT and complete the GUI popup:
```bash
xcode-select --install
```

**`Refusing to load formula … from untrusted tap mongodb/brew`** — trust the tap once:
```bash
brew trust mongodb/brew
```

**Migrate Homebrew to arm64** (if `which brew` shows `/usr/local/bin/brew`):
```bash
# 1. Install native arm64 Homebrew (targets /opt/homebrew automatically on Apple Silicon)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# 2. Put it first in PATH (zsh)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
# 3. Confirm
which brew                       # /opt/homebrew/bin/brew
brew config | grep -i rosetta    # Rosetta 2: false
# (Formulae don't carry over between the two prefixes — reinstall what you need on the arm64 brew.)
```
The arm64 installer also installs the Command Line Tools if they're missing.
