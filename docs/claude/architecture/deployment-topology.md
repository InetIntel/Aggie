# Deployment Topology (ioda-dev / staging)

_Last updated: 2026-10-02_

Hard-won operational details about how Aggie actually runs on the InetIntel server. None of
this is in the repo's generic runbooks (`SCRIPTS.md`, `ecosystem.config.js`), which describe a
PM2 + domain-root setup that does **not** match reality here.

## TL;DR

- The deployed branch is **`staging`** (not `develop`).
- The app is served under a **URL subpath, `/aggie`** — not at the domain root.
- It runs as a **plain `node app.js` process (via `npm start`)**, **not PM2**, under the OS user **`ioda`**.
- Because of the subpath, **browser-facing `/media/...` URLs must include the `/aggie` prefix** or nginx returns the SPA HTML instead of the file (see the media bug below).

## The running process

- Host: `ioda-dev.inetintel.cc.gatech.edu`
- OS user: **`ioda`**
- Checkout: **`/home/ioda/Aggie-FuCo`**
- Started with `ENVIRONMENT=production node app.js` (the `npm start` script), which forks the
  two backend children (see [multi-process backend](../../../CLAUDE.md)):
  - `aggie-api` — Express + socket.io on `127.0.0.1:3000`
  - `aggie-fetching` — the downstream poller
- **No PM2.** `pm2`/`npx pm2` are not installed in the checkout; `~/.pm2` does not exist. Do not
  assume PM2 commands work. To inspect the live process, read `/proc/<pid>/environ` and
  `/proc/<pid>/cwd` (you can do this as `ioda` without sudo).
- Deploys/restarts are done by the `ioda` user (no passwordless sudo available to us).

## Environment (as seen in the live `aggie-api` process)

| Var | Value | Effect |
|-----|-------|--------|
| `ENVIRONMENT` | `production` | Prod branch in `backend/api.js` (serves `/build`, `/media`, SPA fallback) |
| `APP_BASE_PATH` | `/aggie` | Backend subpath prefix |
| `PUBLIC_URL` | `https://ioda-dev.inetintel.cc.gatech.edu/aggie` | Frontend base (axios `baseURL`, asset paths); **baked into the build at `npm run build` time** |
| `MEDIA_ROOT` | _unset_ | Not used by the running app (media is served from MongoDB). Only read by the one-off `backend/scripts/backfillMediaToMongo.js` to find the legacy disk tree; falls back to `<checkout>/public/media` |

## nginx / subpath routing

- nginx routes **`/aggie/*` → the node app** on `127.0.0.1:3000`, stripping the `/aggie` prefix
  (so node, which mounts routes at its own root like `/media` and `/api`, sees them without the prefix).
- A **bare `/media/...` at the domain root does NOT reach node** — it falls through to the SPA and
  returns `Content-Type: text/html` (the React `index.html`) with a `200`. This is the trap that
  made "all my curls return 200" misleading — always check the **content-type**, not just the status:

  ```bash
  # WITHOUT /aggie -> text/html (the SPA, NOT the file)
  curl -sI "https://ioda-dev.inetintel.cc.gatech.edu/media/<key>" | grep -i content-type
  # WITH /aggie -> the real file
  curl -sI "https://ioda-dev.inetintel.cc.gatech.edu/aggie/media/<key>" | grep -i content-type
  ```

## Consequence: media URLs must be base-path aware

Because images render as native `<img src="...">` (not axios calls, which already use `PUBLIC_URL`),
a **root-relative `/media/...` drops the `/aggie` prefix** → browser hits the domain root → nginx
serves the SPA → the image is blank. This silently broke **all** local-media images under `/aggie`:
IODA/Cloudflare charts **and** Mastodon/Telegram social thumbnails (both landed together in PR #123).
Remote-URL sources (Twitter/IG/FB/Cloudflare absolute URLs) were unaffected — which is why only
*some* social photos broke.

**Fix (2026-07-13):** prefix media URLs with the app base path at both builders:
- Frontend `resolveMediaUrl` ([`src/components/SocialMediaPost/reportParser.ts`](../../../src/components/SocialMediaPost/reportParser.ts)) — derives the prefix from `PUBLIC_URL`'s pathname, exactly like [`src/index.tsx`](../../../src/index.tsx).
- Backend `buildMediaUrl` ([`backend/fetching/utils/socialImageStorage.js`](../../../backend/fetching/utils/socialImageStorage.js)) — prefixes with `APP_BASE_PATH`.

See [media-image-storage.md](./media-image-storage.md) for the storage/serving model this builds on.

### Deploying that fix here

- **Frontend:** `PUBLIC_URL` is compiled in at build time, so a code change to `resolveMediaUrl`
  requires **`npm run build`** (with `PUBLIC_URL=…/aggie` present in the env, as it already is).
- **Backend:** `buildMediaUrl` reads `APP_BASE_PATH` at runtime, so the **`aggie-api` process must
  be restarted** to pick up the change (restart done by the `ioda` user; not PM2).

## Gotchas worth remembering

- **Report media lives in MongoDB, not the checkout.** Image bytes are in the `mediaassets`
  collection (see [media-image-storage.md](./media-image-storage.md)), so a deploy that replaces
  the checkout no longer affects report media. Any `public/media` or `public/ioda-charts-backup`
  directories still in the checkout are leftovers from the disk-to-Mongo migration. Confirm
  `backend/scripts/backfillMediaToMongo.js` has run on this server before deleting them.
- **Exception: incident comment attachments are still on disk** in `<checkout>/public/uploads`.
  Normal deploys (`git pull`, rebuild, restart) leave them alone, but moving servers,
  re-cloning or `git clean -fdx` would delete them. Back that directory up first. See
  [incident-attachments-on-local-disk.md](../bugs/incident-attachments-on-local-disk.md).
- **Legacy IODA chart backfill.** New IODA reports store signal JSON
  (`metadata.rawAPIResponse.chart`); only old reports still carry an SVG `image`. The canonical
  backfill is `scripts/backfill/backfill-ioda-charts.js`, which re-fetches the signal series
  from the IODA API. `scripts/backfill-ioda-svg-to-json.js` is a fallback for outages too old
  for the signals API. `scripts/migrate-ioda-svg-to-storage.js` is superseded by both; don't run
  it. Production status of these backfills hasn't been verified; check before running.
