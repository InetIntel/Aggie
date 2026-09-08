# Plan: Move dev off the shared Atlas cluster to a local MongoDB

## Context

The dev database that keeps "filling up exponentially" is **not a mock** — `DATABASE_URL` in `.env` points at a real **MongoDB Atlas M0 free-tier cluster with a hard 512 MB cap**. There is no in-memory server, docker, or seed data path in this repo.

It fills because the fetching process runs 24/7 (~every 100s per source) and, with **no TTL / cap / retention anywhere**, every cycle writes:
- one `reports` doc per item that **embeds the entire upstream API payload** in `metadata.rawAPIResponse` (`backend/fetching/hooks/postToReport.js`), and
- **image bytes stored inline** (BSON BinData) in the `mediaassets` collection — two docs per social image (`backend/fetching/utils/socialImageStorage.js`, `backend/models/mediaAsset.js`).

The DB is throwaway (just yours) and the goal is the **root fix**: run MongoDB locally and point dev at it. Local disk is effectively unlimited, so the 512 MB cap stops being a factor — fetching can grow the DB freely and you can wipe/recreate it anytime. This also stops dev writes from consuming the shared cluster's quota.

## Approach

Stand up a local MongoDB 7.x, repoint `.env` at it, and let `postinstall` recreate the admin user + indexes on the empty local DB. No data migration needed (throwaway).

### 1. Run MongoDB locally (pick one)

**Homebrew (recommended — persistent service):**
```
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```
Listens on `mongodb://localhost:27017`. `brew services` auto-restarts it on reboot.

**Docker (alternative):**
```
docker run -d -p 27017:27017 --name aggie-mongo mongo:7
```

Verify it's up: `mongosh --eval 'db.runCommand({ping:1})'`.

### 2. Repoint `.env` at local Mongo

In `/Users/ronniegross/workspace/gatech/Aggie/.env`, change the two DB lines (keep the Atlas string commented so you can switch back):
```
# Atlas (shared, 512MB cap) — kept for reference:
# DATABASE_URL=mongodb+srv://Cluster23683:...@cluster23683.phblaru.mongodb.net/?appName=Cluster23683
DATABASE_URL=mongodb://localhost:27017
DATABASE_NAME=aggie
```

Why this works: `backend/database.js:73-78` uses `DATABASE_URL` as the connection string and passes `DATABASE_NAME` as the `dbName` option — so a bare `mongodb://localhost:27017` + `DATABASE_NAME=aggie` is correct. (Note: the "defaults to localhost" message at `database.js:65-68` is misleading — it actually **throws** if `DATABASE_URL` is unset, so the var must be present.)

### 3. Seed the local DB (admin user + indexes)

The local `aggie` DB starts empty. Recreate the admin account and Report indexes by running the existing installer once (it reads `ADMIN_EMAIL`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` from `.env`):
```
node install.js
```
This is the same script that runs as `postinstall` — it ensures `Report` indexes and creates the `admin` user if none exists (`install.js`). No new code required.

## Files touched

- `.env` — the only edit (swap `DATABASE_URL` / `DATABASE_NAME`). No source changes; `backend/database.js` already reads both correctly.

## Verification (end-to-end)

1. `npm run dev:backend` → expect `Mongoose connection open to database.` and **no** Atlas host in logs.
2. Log in at `https://localhost:8000` with the admin creds from `.env` (confirms the local admin user was created).
3. Add/enable a source and let it fetch; confirm reports appear in the UI.
4. Confirm writes land locally, not Atlas:
   ```
   mongosh aggie --eval 'db.reports.countDocuments()'
   mongosh aggie --eval 'db.stats().dataSize'   # grows locally, no 512MB ceiling
   ```
5. Anytime it gets messy, reset instantly: `mongosh aggie --eval 'db.dropDatabase()'` then `node install.js`.

## Notes / follow-ups (out of scope unless you want them)

- The shared Atlas cluster still holds your old data. If you want to reclaim its space too, `node backend/scripts/trim-reports-to-size.js --yes [--purge-media]` trims `reports` (+ inline media) down to `KEEP_BYTES`.
- The Atlas credentials are committed in your local (gitignored) `.env`; since it's a shared cluster, consider rotating them separately.
- Durable auto-retention (TTL index / scheduled trim) and shrinking per-doc size (dropping `rawAPIResponse` / inline media) remain unaddressed by design — local disk makes them unnecessary for *your* dev, but they'd matter for the shared/prod DB.
