# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Aggie is a web application for tracking groups around real-time events (elections, disasters) by aggregating items ("reports") from social media and feed sources (Twitter, Facebook, TikTok, Instagram, TruthSocial, Mastodon, Telegram, Junkipedia, RSS, IODA, Cloudflare). Reports can be triaged as relevant/irrelevant and grouped into "incidents"/"groups" for follow-up. Roles: admin, manager, monitor, viewer.

Node `^22.14.0` (use `fnm install` then `fnm use`; pinned in `.nvmrc`). MongoDB `>= 7.0.0`. Mongoose is pinned to `^5.9.16` — schemas use callback-style APIs and `useCreateIndex`. Do not assume Mongoose 6+/7+ idioms.

## Commands

- `npm run dev` — runs frontend (`react-scripts` on `:8000`) and backend (nodemon on `:3000`) split-pane via stmux. Use `npm run dev:frontend` / `npm run dev:backend` to run them in separate shells.
- `npm run build` — production React build (`CI=false`, so warnings don't fail the build).
- `npm start` — production: runs `node app.js` with `ENVIRONMENT=production`. Expects the React build to already exist; in production the API process serves `/build`.
- `node install.js` — runs automatically as `postinstall`. Ensures Report indexes and creates an `admin` user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if none exists.
- No test runner is configured (`npm test` is not wired up).
- Dev URL: `https://localhost:8000` (the backend defaults to HTTPS if `backend/config/key.pem` and `cert.pem` exist, otherwise HTTP). The frontend dev server proxies `/api`, `/login`, `/logout`, `/session`, `/socket` to `http://127.0.0.1:3000` via `src/setupProxy.js`.
- Branching: feature branches off `develop` (the staging/main branch — production is built from it). Don't push directly to `develop`.

## Required env (`.env`, copied from `.env.example`)

`DATABASE_URL`, `DATABASE_NAME`, `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_PARTY` (dev-only auth bypass), `SECRET`, `JWT_SESSION`, WebAuthn (`RP_ID`, `RP_NAME`, `ORIGIN`, `APP_BASE_PATH`, `MFA_REQUIRE_FOR_ENROLLED`), `ENCRYPTION_KEY` (AES-256), `API_REQUEST_TIMEOUT`, `API_FETCH_INTERVAL`, `SOCKET_FRONTEND_PORT` (default `37778`), `PUBLIC_URL`. Ask a maintainer for the shared dev `.env` and DB connection string.

## Architecture

The repo is **one Node project containing two largely separate apps** that share Mongoose models.

### Multi-process backend

`app.js` forks two child processes via `backend/process-manager.js`:

- **API** (`backend/api.js`, process title `aggie-api`) — Express + Passport on port `3000`, serves REST under `/api/*`, hosts socket.io. In production it also serves the built React app from `/build`.
- **FETCH** (`backend/fetching.js`, process title `aggie-fetching`) — runs the `downstream` library to poll all sources.

`process-manager.js` re-spawns crashed children automatically and routes events between them via `child-process.js` + `event-proxy.js`. When you see `childProcess.setupEventProxy({ emitter, subclass, emitterModule })` in `backend/api.js`, it's hooking a Mongoose schema event in the *fetching* process and forwarding it to a listener in the *api* process. **Mongoose model events fire in whichever process saved the document; cross-process notification only works if a proxy is registered.**

### Fetching pipeline

`backend/fetching/` is built around a single shared `Downstream` instance (`downstream.js`):

1. `sourceToChannel.js` reads `Source` documents from Mongo, maps each `source.media` (`twitter`, `mastodon`, `telegramBot`, `telegramUser`, `junkipedia`, `rss`, `ioda`, `cloudflare`, ...) to a Channel class in `channels/`, and registers it with `downstream`. The map between `Source._id` and Channel ID lives in-memory in `sourceChannelJoin`.
2. Hooks in `fetching/hooks/` run on every fetched item: `postToReport` → `saveToDatabase` → (optionally) `tagReportsAI`, `findImages`. Hooks are registered with `downstream.use(...)` in `backend/fetching.js`.
3. Listeners in `fetching/listeners/` react to settings/source changes pushed from the API process so channels can be enabled/disabled/created/deleted at runtime without restarting.
4. `config.get().fetching` is the master on/off switch — channels are registered regardless, but `downstream.start` filters on `channel.enabled && fetching`.

When adding a new source type: add a Channel class in `channels/`, wire it into the `switch (media)` in `sourceToChannel.createChannel`, add UI in `src/pages/Settings/source/`, and update `backend/api/controllers/sourceController.js`.

### API layer

- Routes: `backend/api/routes/apiRoutes.js` is the aggregator mounted at `/api` (after `auth.authenticate()`). Each resource has a `*Routes.js` + matching `controllers/*Controller.js`.
- Auth: `backend/api/authentication.js` (passport-local + passport-jwt + WebAuthn via `@simplewebauthn/server`). Auth routes are mounted *before* `/api` so login/logout don't require a token. `ADMIN_PARTY=true` short-circuits auth in development.
- Sockets: `backend/api/socket-handler.js` + `backend/api/sockets/` push live updates (new reports, source state, tag changes) to the frontend over socket.io. Mongoose schema event listeners are deferred 500ms after startup so cross-process proxies bind first.
- Models: `backend/models/` (Mongoose schemas). `report.js`, `source.js`, `group.js`, `user.js`, `credentials.js`, `tag.js`, plus auth-session models. Reports use full-text indexing — `install.js` calls `Report.ensureIndexes`.

### Frontend (`src/`)

React 17 SPA built with **`react-scripts` 5** (CRA). This locks us to React 17, TypeScript 4.5, Tailwind 3, headless-ui 1.7, and TanStack Query v4. **Don't use newer-version idioms** — when looking up docs, use the version-specific docs linked in `FRONTEND.md`.

Folder convention: **folders define scope; place files as close as possible to where they're used**. A hook used only in `pages/Reports/` belongs in `pages/Reports/`, not in the global `hooks/`.

Key directories:
- `src/api/<resource>/index.ts` — axios calls; `types.ts` — response/request types.
- `src/pages/` — file structure mirrors the router (see `AppRouter.tsx`).
- `src/components/` — only for components used in multiple pages.
- `src/objectTypes.d.ts`, `src/helpers.tsx` — **legacy**. New types/helpers go in scoped locations.

There is no shared API schema — frontend types are hand-written to match what the backend controllers return. Read the controller before changing a request.

When refactoring legacy code: keep the old file alongside (rename to `*_old` or `*_untyped`) rather than deleting, until it can be cleaned up during downtime.

### Real-time data flow

Frontend uses TanStack Query for REST and a socket.io connection (proxied through `/socket` in dev) for push updates. The socket connection is authenticated via the same session cookie (`passport.socketio`). When you change a Mongoose model that has socket listeners (Report, Source, Tag, Group), confirm both the in-process listener (`api.js`) and the cross-process proxy from fetching are still wired.

## Conventions worth knowing

- HTTPS by default on the backend if certs are present; otherwise HTTP. To run without certs locally, just don't create `backend/config/{key,cert}.pem`.
- Production deployments use PM2 (`npx pm2`); see `SCRIPTS.md` for the full Ubuntu setup runbook.
- The frontend build path is `/build` (served by the API in production), not `/dist`.
- `node_modules/downstream` is a local fork — don't assume the npm registry version matches.
