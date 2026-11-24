# Deployment Topology (dev and prod)

_Last updated: 2026-11-24_

Operational details about how Aggie runs on the InetIntel servers. The generic runbooks (`SCRIPTS.md`, `ecosystem.config.js`) describe a PM2 setup at the domain root. That setup does **not** match these servers.

## Hosts

Since 2026-11, dev and prod are on two different hosts. Only prod uses a URL subpath.

| Env | App URL | URL subpath | `PUBLIC_URL` in the live build |
|-----|---------|-------------|--------------------------------|
| dev | `https://<dev-host>/` | none (domain root) | `https://<dev-host>` |
| prod | `https://<prod-host>/aggie/` | `/aggie` | `https://<prod-host>/aggie` |

The `PUBLIC_URL` values come from the live JS bundles (2026-11-24). Before 2026-11, dev was at `https://<old-dev-host>/aggie`.

Prod shares its origin with another site. Paths outside `/aggie` (for example `/alerts`) return that other site, not Aggie.

## Base-path rules

- Frontend code must work with both a `/aggie` base and a root (`/`) base.
- `new URL(PUBLIC_URL).pathname` is `/aggie` on prod and `/` on dev. Remove the trailing `/` before you add a path. If you do not, dev gets `//alerts`. The browser reads `//alerts` as the host `alerts`. This broke the dev login redirect. `loginRedirectPath` in `src/pages/Login.tsx` has the fix.
- The backend reads `APP_BASE_PATH` at runtime. It must be `/aggie` on prod and empty on dev. The value on the new hosts is not verified.

## The running process

These details were verified on the old dev host (2026-10-02). They are not verified on the new hosts.

- OS user: **`ioda`**
- Checkout: **`/home/ioda/Aggie-FuCo`**
- Started with `ENVIRONMENT=production node app.js` (the `npm start` script). This forks the two backend children (see [multi-process backend](../../../CLAUDE.md)):
  - `aggie-api`: Express and socket.io on `127.0.0.1:3000`
  - `aggie-fetching`: the downstream poller
- **No PM2.** `pm2` and `npx pm2` are not installed in the checkout, and `~/.pm2` does not exist. To inspect the live process, read `/proc/<pid>/environ` and `/proc/<pid>/cwd` as `ioda` (no sudo necessary).
- The `ioda` user does deploys and restarts. No passwordless sudo is available.

## Environment (as seen in the live `aggie-api` process on the old host)

| Var | Value | Effect |
|-----|-------|--------|
| `ENVIRONMENT` | `production` | Prod branch in `backend/api.js` (serves `/build`, `/media`, SPA fallback) |
| `APP_BASE_PATH` | `/aggie` on prod, empty on dev (not verified on the new hosts) | Backend subpath prefix |
| `PUBLIC_URL` | See [Hosts](#hosts) | Frontend base (axios `baseURL`, asset paths). **Compiled into the build at `npm run build` time.** |
| `MEDIA_ROOT` | _unset_ | Not used by the running app (media is served from MongoDB). Only read by the one-off `backend/scripts/backfillMediaToMongo.js` to find the legacy disk tree; falls back to `<checkout>/public/media` |

## nginx and subpath routing (prod)

- nginx sends **`/aggie/*` to the node app** on `127.0.0.1:3000` and removes the `/aggie` prefix. Node mounts its routes (`/media`, `/api`) at its own root.
- nginx redirects `/aggie` (no trailing slash) to `/aggie/` with a 301.
- A **bare `/media/...` at the domain root does NOT reach node**. It goes to the other site on that origin, which returns `Content-Type: text/html` with a `200`. Always check the **content type**, not only the status:

  ```bash
  # WITHOUT /aggie -> text/html (the other site, NOT the file)
  curl -sI "https://<prod-host>/media/<key>" | grep -i content-type
  # WITH /aggie -> the real file
  curl -sI "https://<prod-host>/aggie/media/<key>" | grep -i content-type
  ```

On dev, the app is at the domain root, so `/media/<key>` reaches node directly.

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
  requires **`npm run build`** on each host, with that host's `PUBLIC_URL` in the env (see [Hosts](#hosts)).
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
