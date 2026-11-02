# Speed up per-role permission QA

## Context
Every feature currently needs manual QA under each role (viewer, monitor, team_lead, admin), plus per-user overrides and team scoping. Access is enforced in two layers: backend (`backend/access/permissions.js` + `backend/api/middlewares/scopedPermissionMiddlewares.js`) and frontend disable/hide logic driven by `Session.permissions`. Goal: two scripts that do the repetitive checks, one per layer, so manual QA only covers judgment calls. `manager` is not a live role and is excluded.

## Branching
- Create `feat/access-smoke-tests` from `origin/development`. Build Steps 1 to 3 there, covering permissions that exist on development. PR targets `development`.
- Then merge `feat/access-smoke-tests` into `feat/kpi-team-breakdown` and add KPI checks there (`view team kpis`, `view all kpis`, `export kpis`, team-scoped KPI access, KPI page in `PAGES`). Run both tools to QA the KPI branch.
- Keep the "smoke" naming (`smoke:access:*`).

## Reuse
- `backend/scripts/access-control-smoke.js` (`npm run smoke:access:seed` / `cleanup`, gated by `ACCESS_CONTROL_SMOKE_FIXTURES=true`): seeds admin, monitor (team_lead membership), scoped viewer, outsider, a team, a source, reports, public/restricted incidents, one shared `PASSWORD`.
- `hasPermission` / `PERMISSION_ROLES` in `backend/access/permissions.js` as the source of truth for expected results (no hand-maintained expectation table).
- Login: `POST /login` (`backend/api/routes/authRoutes.js:8`) sets a `jwt` cookie and returns `token`; fixture users have no MFA, so no challenge (`authController.js:152`).
- `playwright` already in package.json.

## Step 1: Extend the smoke seed
In `access-control-smoke.js`, add to `USERS`: a plain `viewer`, plain `monitor`, global `team_lead`, plus two override users (monitor with `permissionOverrides.deny: ['edit data']`, viewer with `allow: ['edit data']`). Export `USERS`, `PASSWORD`, and fixture IDs (or write them to a gitignored `scratchpad/access-fixtures.json` on seed) so the other scripts can find the fixture docs. Cleanup already deletes by username list, so new users are covered.

## Step 2: API matrix script
New `backend/scripts/access-control-matrix.js`, `npm run smoke:access:matrix`.
- Reads base URL from env (default `http://127.0.0.1:3000`), logs in as each fixture user, keeps the cookie.
- Declarative `CHECKS` array: `{ name, method, path(fixtures), permission, body? }`. Paths/bodies target only fixture docs (fixture report, incidents, source, team) so mutations are safe. Start with ~15 to 20 checks covering each permission key (view/edit data, change settings, manage sources, manage incident access, view/update/delete users, edit tags, KPIs).
- Expected = allow if `hasPermission(user, permission)` (plus team scope for scoped routes); actual = status 2xx vs 401/403.
- Prints a role x check grid (allow/deny, mismatches highlighted) and exits non-zero on any mismatch.
- Adding a new feature = append one line to `CHECKS`.

## Step 3: Playwright UI sweep
New `scripts/access-control-screens.js`, `npm run smoke:access:screens`.
- For each fixture user: launch, log in through the real login form once, save `storageState`, then visit a `PAGES` list (reports, report detail for fixture report, incidents, incident detail, settings/sources, settings/users, settings/tags, KPIs).
- Screenshot each page to `scratchpad/access-control-screens/<page>/<user>.png`.
- Optional per-page assertions: `{ selector, expect: 'enabled' | 'disabled' | 'hidden' }` keyed by permission, so disabled buttons with PermissionHint are checked, not only eyeballed.
- Write `scratchpad/access-control-screens/index.html`: rows = pages, columns = roles, so a reviewer scans one row per feature.
- Base URL default `https://localhost:8000`, `ignoreHTTPSErrors: true` for local certs.

## Files
- `backend/scripts/access-control-smoke.js` (modify)
- `backend/scripts/access-control-matrix.js` (new)
- `scripts/access-control-screens.js` (new)
- `package.json` (two scripts; run `npx playwright install chromium` once)
- `docs/claude/runbooks/access-control-smoke-tests.md` (new): seed, run, read, cleanup.
- `backend/scripts/access-control-fixtures.js` (new): shared fixture definitions and id lookup.

## Verification
1. `ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed`
2. `npm run dev:backend` and `npm run dev:frontend`, then `npm run smoke:access:matrix`: grid should be all green; locally flip one role in `PERMISSION_ROLES` and confirm the script fails on exactly those cells, then revert.
3. `npm run smoke:access:screens`: open `scratchpad/access-control-screens/index.html`, compare one role against a manual login.
4. `npm run smoke:access:cleanup`: confirm fixture users/docs are gone.
