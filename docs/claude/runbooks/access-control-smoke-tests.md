# Access-control smoke tests

## Quick start

Start the app in two terminals:

```bash
npm run dev:backend    # terminal 1, API on :3000
npm run dev:frontend   # terminal 2, app on :8000
```

Then, in a third terminal:

**To test:**

```bash
ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed
npm run smoke:access:matrix
npm run smoke:access:screens
```

**To clean up:**

```bash
ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:cleanup
```

**On Windows (PowerShell),** the inline `VAR=value command` form doesn't work. Set the flag first; it lasts for the rest of that terminal session:

```powershell
$env:ACCESS_CONTROL_SMOKE_FIXTURES = "true"
npm run smoke:access:seed       # or smoke:access:cleanup
Get-Content scratchpad/access-control-smoke-password.txt   # smoke user password
```

The rest of this doc explains the setup, the fixtures, and how to read the output.

## Overview

Two scripts that check what each role can do, so per-role QA doesn't mean logging in as every user by hand.

- `npm run smoke:access:matrix` calls the API as every smoke user and prints a pass/fail grid. It covers backend enforcement. It then runs the [KPI checks](#kpi-checks), which verify KPI team tagging, shared counts and the CSV export.
- `npm run smoke:access:screens` screenshots each page as every smoke user and builds a side-by-side page. It covers what each role sees. The page also shows the grid and KPI results saved by the last matrix run, so run the matrix first; screens doesn't call the API checks again.

Both run against a local dev stack and the throwaway smoke fixtures. Never point them at production.

For the access model itself (account vs team roles, access modes, the per-role permission table), see `docs/access-control/`.

> **For agents:** don't run these scripts, the seed/cleanup, or the dev servers yourself. Give the developer the commands to run in their own terminal, and work from the output they share.

## Setup

1. Make sure `ADMIN_PARTY` is not `true` in `.env`. It bypasses every permission check, so every cell would pass.
2. Seed the fixtures. The command refuses to run without the env flag:
   ```bash
   ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed
   ```
   This creates six teams (one with permission limits, one inactive), a public IODA source, three country-restricted sources, a team-restricted source, a public-until source, reports, a public incident, incidents restricted to the smoke team, Teams A, B and C, and the Limited Team, a policy incident for the access policy checks, an incident comment attachment, and the users below. Every source is disabled. Seeding first deletes any earlier fixtures, so it is safe to rerun.

   The attachment is a small text file written to the upload directory (`UPLOAD_DIR`, default `public/uploads`), because downloads are served from disk. If the dev frontend is running, writing it may reload the page once. The matrix's upload check also writes files there (`<timestamp>_access-control-smoke-upload.txt`) and deletes each one right after. Seeding and cleanup delete the attachment and any leftover uploads.

   **Password:** each seed generates a new random password shared by all smoke users. It's printed in the seed output and saved to `scratchpad/access-control-smoke-password.txt` (gitignored), where the matrix and screens scripts read it. To log in as a smoke user by hand, use that password. Reseeding changes it, and cleanup deletes the file. The password is never committed because this repo is public: a known password on the smoke admin account would be a way in to any database that got seeded by mistake.
3. Start the app: `npm run dev:backend` and `npm run dev:frontend` in separate terminals. The matrix only needs the backend; the screens need both. The seed writes straight to MongoDB, so it can run before or after the app starts. Reseeding recreates the smoke users with a new password, so log in again afterward if you were signed in as one.

**Teams**

| Team | Countries | Settings | Restricted incident |
|---|---|---|---|
| smoke team (`Access Control Smoke`) | none | | `Access Control Smoke Restricted Incident` (holds the main source's after report and a comment attachment) and `Access Control Smoke Policy Incident` |
| Team A | France (FR) | | `Access Control Smoke Team A (FR) Incident` |
| Team B | Mexico (MX) | | `Access Control Smoke Team B (MX) Incident` |
| Team C | France, Mexico | | `Access Control Smoke Team C (FR, MX) Incident` |
| Limited Team | none | `permissionLimits.deny: ['edit data']` | `Access Control Smoke Limited Team Incident` |
| Inactive Team (DE) | Germany (DE) | `active: false` | none |

**Incidents**: `Access Control Smoke Public Incident` is visible to anyone with view data. Each restricted incident is visible only to admins and that team's members, and editable by admins and members whose team role grants edit. The restricted incident's comment has an attachment, `/incidents/uploads/access-control-smoke-attachment.txt`. The policy incident exists only for the checks that change an incident: the access policy checks and the upload check. After each request the matrix puts back its policy and removes any comments and uploaded files.

**Sources**:
- `Access Control Smoke Source` (public) has a report before and after `CUTOFF_DATE`. The after report is in the smoke team's restricted incident.
- `=Access Control Smoke Formula Source` (public, no reports): its name checks CSV formula escaping.
- `... France Source`, `... Mexico Source` and `... Germany Source` are country_restricted to FR, MX and DE, each with one report. Members see country-restricted sources whose countries overlap their **active** teams'. Only the inactive team covers Germany, so only admins see it. Editing those reports also needs edit rights on an active team that covers the country.
- `Access Control Smoke Team A Source` is restricted to Team A, with one report.
- `Access Control Smoke Public Until Source` is public_until 2026-01-15 for the smoke team, with a report before and after the cutoff. Everyone with view data sees the before report; only smoke team members see the source itself and the after report. Reports on team sources can be edited by global editors (admin, team_lead) or by members with edit rights on one of the source's teams.

**Users**

| Key | Username | Role | Teams |
|---|---|---|---|
| `admin` | `smoke_access_admin` | admin | |
| `teamLead` | `smoke_access_team_lead` | team_lead (global) | |
| `alpha` | `smoke_access_alpha` | monitor | team_lead on smoke team (also in its `leads`) |
| `scopedMonitor` | `smoke_access_scoped_monitor` | viewer | monitor on smoke team |
| `outsider` | `smoke_access_outsider` | monitor | |
| `viewer` | `smoke_access_viewer` | viewer | |
| `monitorNoEdit` | `smoke_access_monitor_no_edit` | monitor, override denies `edit data` | |
| `viewerCanEdit` | `smoke_access_viewer_can_edit` | viewer, override allows `edit data` | |
| `teamAMonitor` | `smoke_access_team_a_monitor` | viewer | monitor on Team A |
| `teamBMonitor` | `smoke_access_team_b_monitor` | viewer | monitor on Team B |
| `teamCMonitor` | `smoke_access_team_c_monitor` | viewer | monitor on Team C |
| `teamABMonitor` | `smoke_access_team_ab_monitor` | viewer | monitor on Team A and on Team B |
| `smokeViewer` | `smoke_access_smoke_viewer` | viewer | viewer on smoke team |
| `smokeMonitorNoEdit` | `smoke_access_smoke_monitor_no_edit` | viewer | monitor on smoke team, membership override denies `edit data` |
| `smokeViewerCanEdit` | `smoke_access_smoke_viewer_can_edit` | viewer | viewer on smoke team, membership override allows `edit data` |
| `limitedMonitor` | `smoke_access_limited_monitor` | viewer | monitor on Limited Team |
| `limitedLead` | `smoke_access_limited_lead` | monitor | team_lead on Limited Team (also in its `leads`) |
| `inactiveMonitor` | `smoke_access_inactive_monitor` | viewer | monitor on Inactive Team (DE) |

Teams, memberships (including per-team overrides in `TEAM_MEMBERSHIP_OVERRIDES`), sources, incidents and users are all defined in `backend/scripts/access-control-fixtures.js`. Add to that file to cover new cases; the seed, matrix and screens pick them up from there.

## API matrix

```bash
npm run smoke:access:matrix
npm run smoke:access:matrix -- --only=incident     # only checks whose name contains "incident"
AGGIE_API_URL=http://127.0.0.1:3000 npm run smoke:access:matrix
```

What it checks, for every user:
- **Reading data:** reports, incidents (public, smoke team, Teams A/B/C, Limited Team), the smoke incident's comment attachment and its report list (`GET /api/report?groupId=`), sources, tags, dashboard, trends
- **Editing data:** reports with no team, reports in a team incident, public and team incidents, releasing a report batch
- **Team roles and limits:** the team viewer role, per-team overrides that deny or allow `edit data`, and the Limited Team's permission limit (its members and lead can view but not edit its incident)
- **Incident access:** the teams `GET /api/team/incident-access` lists (checked in the response body), and changing the policy incident's access: adding Team A, making it public, and restricting it to the inactive team (always refused; admins get a 400)
- **Incident attachments:** downloading the smoke incident's attachment, and uploading one in a new comment (`PATCH /api/group/_comment_add`, to the policy incident). An allowed upload must also be saved on the incident and on disk.
- **Country access:** viewing the France, Mexico and Germany sources, and viewing and editing their reports. Germany is covered only by the inactive team, so its member is denied.
- **Team sources:** viewing the Team A source and the public-until source, and viewing and editing their reports before and after the cutoff
- **Settings and sources:** credentials, settings, deleting sources and tags
- **Users and teams:** user directory, user list, editing and deleting users, deleting teams, the permissions editor
- **KPIs:** viewing KPIs, exporting them, and viewing Team A's KPIs. Expected results come from `getKpiAccess` and `canExportKpis` in `backend/access/kpiAccess.js`.

In the terminal, each cell shows `allow` or `-` (denied) when the result matches what's expected; the HTML report shows `allow` or `deny`. A mismatch shows the actual result in caps with `!` (`ALLOW!`, `DENY!`, `ERROR!`, or `BODY!` when an allowed request returned the wrong content). The mismatches are listed with HTTP status codes under the grid, and the script exits non-zero.

Expected results come from `hasPermission` in `backend/access/permissions.js`, team roles from `backend/access/teamMemberships.js`, and source and incident rules from `backend/access/sourceAccess.js` and `incidentAccess.js`, so changing those helpers changes the expectations too. Checks whose route adds team scope or controller rules use an `expect(u)` function instead (see `buildUserContext` and the comments in `CHECKS`).

**Adding a check:** append one entry to `CHECKS` in `backend/scripts/access-control-matrix.js`. Rules that keep reruns safe:
- Point deletes and other destructive calls at `MISSING_ID`. An allowed request reaches the controller and gets a 404, so nothing is deleted.
- Mutations on fixtures write back the values the seed stored (for example, incident notes).
- Never add bulk routes like `DELETE /api/source/_all` or `/api/group/_all`, or anything that changes global settings.
- If a route returns 404 to hide a document the user can't see, set `hidden: true` so a 404 counts as denied.
- If a route refuses with another status (like a 400), list it in `deniedStatuses`.
- To send multipart form data (file uploads), add `form(f, userKey)` returning a `FormData` instead of `body`.
- To check what an allowed request returns or saved, add `expectBody(u, body, f)`. It returns `true`, or a string saying what's wrong (or a promise of either), and runs before `reset`.
- If a request can change a fixture and can't write back the seeded value itself, add `reset(f)`, which runs after every request of that check through the matrix's database connection.

**Coverage guard:** before it runs, the matrix compares `ACCESS_COVERAGE` in `backend/scripts/access-control-fixtures.js` against the schemas: Source and Group `accessPolicy.mode` values, team membership roles, Team fields, and team membership fields (`User.teamMemberships[]`). If you add a restriction (a new mode, or a Team field like `countryCodes`), the matrix stops and names it. To clear it, add fixtures and `CHECKS` for it, update this runbook and `docs/access-control/`, then list it under `covered`. If testing is deferred, list it under `knownGaps` instead, and add it to [Coverage gaps (TODO)](#coverage-gaps-todo); a Team field that doesn't control access goes under `notAccess`.

### KPI checks

After the grid, the matrix acts as four smoke users and checks the results on the KPI page. Each line prints `PASS` or `FAIL` (with the reason), and any failure makes the command exit non-zero. The checks live in `backend/scripts/access-control-kpi.js`.

| User | Action | Counts for |
|---|---|---|
| `teamAMonitor` | logs in; ignores, investigates, then ignores again a France alert | Team A |
| `teamABMonitor` | logs in; investigates another France alert | Team A and Team B (shared) |
| `outsider` | logs in; ignores a social post | No team |
| `alpha` | logs in; links a public alert to the smoke team's incident; creates an incident restricted to the smoke team | smoke team |

What it checks:
- **Team tagging:** every KPI event from those actions (logins, investigate, ignore, link to incident, incident created) records the acting user and the right `teamIds`, read straight from MongoDB. Missing `teamIds` means the request context was lost, and the activity would show as "Team not recorded".
- **Counts:** the change in each team's totals and shared counts on the KPI page, a repeated ignore counting once, and Team A + B selected together counting the shared actions once.
- **Scope:** `alpha` sees only the smoke team.
- **CSV export:** the BOM and header, Team A's total, shared and daily rows match the JSON, Team A's user count (2), the France source listed and the Mexico source left out, a source name starting with `=` written as text (`'=...`), and "No team" exports with no current totals.

Each run triages its own new fixture reports, because KPI report actions count once per report per day. That makes reruns on the same day safe. Counts are compared before and after the actions, so earlier activity doesn't matter, but don't act as a smoke user or as a user with no team while it runs. A run that crosses midnight UTC fails; rerun it.

`--only=kpi` runs the KPI rows of the grid plus the KPI checks; any other `--only=` filter skips the KPI checks. Every run saves the grid to `scratchpad/access-control-matrix-results.json`, and each run that includes the KPI checks saves their results to `scratchpad/access-control-kpi-results.json` (both gitignored). The screens report shows both. A filtered run replaces the saved grid with just its checks, and the report says which filter it used. Seeding and cleanup delete both files, so the report never shows results for fixtures that no longer exist. The KPI checks leave fixture reports, a fixture incident per run, and KPI events behind until cleanup.

## UI screens

```bash
npm run smoke:access:screens
npm run smoke:access:screens -- --only=settings
npm run smoke:access:screens -- --no-open     # don't open the report in a browser
AGGIE_APP_URL=https://localhost:8000 npm run smoke:access:screens
```

It captures screenshots 4 users at a time, printing a line per page. It makes no API checks of its own: the matrix and KPI sections of the report come from the results saved by the last `npm run smoke:access:matrix`. When it finishes, it opens the report in your default browser.

Output goes to `scratchpad/access-control-screens/` (gitignored), which is wiped at the start of each run. The report is `index.html` there. It's rewritten as each user finishes and on Ctrl+C, so you can open it mid-run. It shows when the run started and finished, then three sections:
- **Screenshots:** rows are pages, columns are users. Click anywhere in a cell (the screenshot or its path) to view it full size in the page (Esc or click outside it to close; Cmd/Ctrl-click still opens a new tab). The last one opened stays outlined, even after a reload. Each cell shows the path the page ended on. A redirect (for example, to the default page because the route isn't available to that role) is highlighted in orange.
- **API permission matrix:** the grid saved by the last `npm run smoke:access:matrix`, as a table, with when it ran and any `--only` filter it used. Mismatches are red and show the expected result and HTTP status. Rerun the matrix to refresh this section.
- **KPI checks:** the results saved by the last `npm run smoke:access:matrix` that included them, with when it ran. Rerun the matrix to refresh this section.

If either section has no saved results (for example, right after seeding), it says to run the matrix.

To cover a new page, add it to `PAGES` in `scripts/access-control-screens.js`. A page can also run an `action` before the screenshot and a `verify` check after it.

The two "Edit ... incident form" rows open the incident's Edit form (on the public incident they also switch Access Mode to "Restricted to teams") and check the team list in the access selector. It must list exactly the fixture teams the matrix expects from `GET /api/team/incident-access` for that user, and the selector may only be hidden when that list is empty. The result shows under each screenshot (green, red, or grey "not checked" when the user can't open the incident), failures are listed above the table, and the terminal prints `CHECK FAILED` lines. They don't change the exit code.

The script uses the Playwright already in `package.json`. If Chromium is missing, run `npx playwright install chromium`.

## Coverage gaps (TODO)

Access rules that are enforced in the app but that no smoke check tests, so the matrix reports "All checks match" even if one breaks. `ACCESS_COVERAGE.knownGaps` lists the ones the coverage guard knows about. None are open right now; see `docs/claude/plans/role-permission-qa-automation.md` for the planned sweeps that will look for more.

When an item is covered, move its value from `knownGaps` to `covered` in `ACCESS_COVERAGE`, update the fixture tables and "What it checks" above, and delete the item here.

## Testing a feature branch

The scripts are on `feat/access-smoke-tests` until it merges into `development`. To QA a feature branch, merge `development` (or the smoke-test branch) into it, then add checks for the branch's new permissions and pages there, so they ship with the feature.

## Cleanup

```bash
ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:cleanup
```

Cleanup also deletes KPI events made by smoke users or about smoke fixtures (signups, logins, triage from the KPI checks), so test activity doesn't stay in the KPI totals. Seeding runs cleanup first, so reseeding clears them too.
