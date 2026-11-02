# KPI smoke coverage: team tagging, shared counts, CSV contents

## Context
`feat/kpi-team-breakdown` (Torrey) adds per-team KPI attribution, "shared" counts, scoped KPI access and a CSV export. The access-control smoke suite (`feat/access-smoke-tests`) only checks allow/deny status codes, and its one KPI row (`permission: 'admin users'`) is now wrong (team leads can view their team's KPIs). Nothing checks that actions get tagged with the right teams, that shared counts and overall totals add up, or what the CSV contains.

The riskiest part of the feature is that triage events get their team from request context (`backend/api/utils/kpiContext.js`, AsyncLocalStorage) carried through Mongoose 5 callback-style saves (`reports_irrelevant_update` uses `Report.find(cb)` + `report.save(cb)`). If that context is lost, events silently land in "Team not recorded" and the page still looks fine. The new checks are built to catch that.

Decisions made: work goes on a new branch; the KPI checks run as a second phase of `smoke:access:matrix` (no new npm script); smoke cleanup also deletes KPI events made by or about smoke fixtures.

## Branch
```sh
git fetch origin
git switch -c feat/kpi-smoke-coverage origin/feat/kpi-team-breakdown
git merge --no-edit origin/feat/access-smoke-tests   # verified clean with merge-tree
```
Save a copy of this plan as `docs/claude/plans/kpi-smoke-coverage.md` on the branch. Commit locally (message shown in chat), never push.

## Changes

### 1. Matrix KPI rows: `backend/scripts/access-control-matrix.js`
- Import `getKpiAccess`, `canExportKpis` from `backend/access/kpiAccess.js`. In `buildUserContext`, add `kpi: getKpiAccess(user, teamDocs, ledTeamIds)` where `teamDocs` are `TEAMS` keys as `{ _id: key, active: true }` (team keys already stand in for ids there).
- Replace the `KPIs` row with:
  - `KPIs`: `GET /api/analytics/kpis`, expect `u.kpi.canView`
  - `Export KPIs`: `GET /api/analytics/kpis/export`, expect `u.kpi.canView && canExportKpis(u.kpi, [])`
  - `KPIs for Team A`: `GET /api/analytics/kpis?team=<f.teams.teamA>`, expect `u.kpi.canView && (u.kpi.global || u.kpi.teamIds.includes('teamA'))`
- Expected with current fixtures: admin allow on all three; `alpha` (lead of smoke team) allow, allow, deny; everyone else deny.
- Pass the matrix's `login` into the KPI module instead of exporting it, to avoid a circular require.
- **Wire in the KPI phase.** In `main()`, after the grid prints, call `runKpiChecks({ baseUrl, login, fixtures, password })` from the new module, unless an `--only=` filter is given that doesn't match "kpi". Print its results under a separate "KPI checks" heading. Any failure there also sets `process.exitCode = 1`. Leave `runMatrix` itself unchanged, so `smoke:access:screens` (which calls `runMatrix`, not `main`) never runs the KPI scenario or creates data. Update the file's header comment to say the matrix has two phases and only the second one creates data.

### 2. KPI content checks module: `backend/scripts/access-control-kpi.js`
Exports `runKpiChecks({ baseUrl, login, fixtures, password })`, which returns `[{ name, pass, detail }]`. It isn't a standalone script and gets no npm script; it runs only as the matrix's second phase. The guards (`ADMIN_PARTY`, fixtures, password) are already handled by the matrix before it's called.

Flow:
1. Range is today UTC (`start=end=today`). If the date changes during the run, fail with "crossed UTC midnight, rerun".
2. Log in as admin first, so admin's own login lands before the baseline.
3. **Fresh reports per run.** Insert 4 reports directly in the DB with `metadata.fixture: FIXTURE_KEY` (so existing cleanup removes them) and guid `${FIXTURE_KEY}-kpi-<runId>-<n>`:
   - R1, R2: alerts on the France source
   - R3: social (`isOutageEvent: false`) on the public source
   - R4: alert on the public source

   KPI report actions count once per report per day, so new report ids keep reruns on the same day deterministic.
4. **Baseline.** As admin, `GET /api/analytics/kpis` with no team param (for the per-team `teams[]` rows) and with `team=<A>,<B>` (overall totals for that selection).
5. **Actions.** Each actor logs in after the baseline, then:

   | Actor | Actions | Expected delta |
   |---|---|---|
   | `teamAMonitor` | `PATCH /api/report/_irrelevance` R1: ignore, investigate, ignore again | Team A: login +1, alerts_ignore +1 (dedup), alerts_investigate +1, shared +0 |
   | `teamABMonitor` | investigate R2 | Team A and Team B each: login +1, alerts_investigate +1, shared login +1, shared alerts_investigate +1 |
   | `outsider` (no team) | ignore R3 | No team: login +1, social_ignore +1 |
   | `alpha` | `PATCH /api/report/_group` R4 into the smoke restricted incident | smoke team: login +1, alerts_assigned +1 |
6. **Shared and overall counts.** Re-fetch both reports and compare deltas to the table. With `team=A,B` selected, the overall totals delta must be login +2 and alerts_investigate +2 (the A+B user counted once, not three times).
7. **Team tagging, checked directly in the DB.** Find `KpiEvent` documents from this run with `actor` in those 4 user ids. Every one must have a `teamIds` array (missing means context was lost) equal as a set to `[A]`, `[A, B]`, `[]` and `[smoke]` respectively. Also assert the response's `writeWarning` is false.
8. **Scoped view.** As `alpha`, `GET /api/analytics/kpis`: `globalAccess` is false, and `teamOptions` and `teams` contain only the smoke team (no "No team" or "Team not recorded").
9. **CSV.** As admin, fetch `GET /api/analytics/kpis?team=<A>&details=1` and `GET /api/analytics/kpis/export?team=<A>` with the same range. Parse the CSV with a small inline parser (quoted cells, `""`, CRLF; no new dependency). Assert:
   - It starts with a BOM, and the first 8 header cells match `reportCsv` in `backend/api/utils/kpiCsv.js`.
   - The `Team total` row for A has the right Team ID and name, and its count and shared columns equal the JSON `teams[A].totals` / `.shared`.
   - The `Daily total` row for today equals the JSON `days` entry.
   - `Current total` → `Users` is 2 (`teamAMonitor`, `teamABMonitor`).
   - `Reports by source` includes the France source and not the Mexico source.
   - The formula fixture source's cell starts with `'=` (escaped).
   - `export?team=unassigned` contains a `Current totals unavailable` row.

### 3. Fixtures and seed: `access-control-fixtures.js`, `access-control-smoke.js`
- Add a public, disabled `FORMULA_SOURCE_NICKNAME = '=Access Control Smoke Formula Source'`. Seed it, add it to the cleanup nickname list, and include it in `loadFixtureIds`.
- Cleanup: before deleting, collect smoke user ids and fixture report and incident ids, then `KpiEvent.deleteMany({ $or: [{ actor: { $in: userIds } }, { subject: { $in: [...userIds, ...reportIds, ...groupIds] } }] })`. Seed already calls cleanup first, so reseeding clears old smoke KPI events too, including the signup events the seed itself creates.

### 4. Docs
- `docs/claude/runbooks/access-control-smoke-tests.md`:
  - Quick start is unchanged. Note under "API matrix" that it runs a second "KPI checks" phase that creates fixture reports and KPI events (removed by cleanup), that `--only=kpi` runs just the KPI parts, and that `screens` skips that phase.
  - New "KPI checks" subsection (what it does, the delta table, why it is rerun-safe, and that it assumes no one else is acting as a smoke user or a no-team user during the run).
  - Update the "What it checks" KPI line and the Sources fixture list (formula source).
  - Cleanup note about KPI events.
- No CLAUDE.md index change needed (runbooks aren't in the architecture index).

## Verification (user runs; runbook says agents don't run the smoke scripts)
1. `ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed`, backend running, `ADMIN_PARTY` off.
2. `npm run smoke:access:matrix`: the grid matches, including the 3 new KPI rows, and the "KPI checks" section is all PASS. Run it again the same day: still all PASS (rerun safety).
3. `npm run smoke:access:matrix -- --only=incident` skips the KPI phase; `npm run smoke:access:screens` doesn't run it either (no new `kpi` fixture reports after a screens run).
4. Sanity check that it can fail: temporarily change one expected delta and confirm a FAIL line and a non-zero exit, then revert.
5. `ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:cleanup`, then in Mongo `db.kpievents.countDocuments({ actor: { $in: [<smoke user ids>] } })` returns 0.
6. `node --check` on each changed script.
