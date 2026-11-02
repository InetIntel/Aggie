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
- `npm run smoke:access:screens` screenshots each page as every smoke user and builds a side-by-side page. It covers what each role sees.

Both run against a local dev stack and the throwaway smoke fixtures. Never point them at production.

For the access model itself (account vs team roles, access modes, the per-role permission table), see `docs/access-control/`.

> **For agents:** don't run these scripts, the seed/cleanup, or the dev servers yourself. Give the developer the commands to run in their own terminal, and work from the output they share.

## Setup

1. Make sure `ADMIN_PARTY` is not `true` in `.env`. It bypasses every permission check, so every cell would pass.
2. Seed the fixtures. The command refuses to run without the env flag:
   ```bash
   ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:seed
   ```
   This creates four teams, a public IODA source, two country-restricted sources, reports, a public incident, incidents restricted to each team (smoke, A, B, C), and the users below. Every source is disabled. Seeding first deletes any earlier fixtures, so it is safe to rerun.

   **Password:** each seed generates a new random password shared by all smoke users. It's printed in the seed output and saved to `scratchpad/access-control-smoke-password.txt` (gitignored), where the matrix and screens scripts read it. To log in as a smoke user by hand, use that password. Reseeding changes it, and cleanup deletes the file. The password is never committed because this repo is public: a known password on the smoke admin account would be a way in to any database that got seeded by mistake.
3. Start the app: `npm run dev:backend` and `npm run dev:frontend` in separate terminals. The matrix only needs the backend; the screens need both. The seed writes straight to MongoDB, so it can run before or after the app starts. Reseeding recreates the smoke users with a new password, so log in again afterward if you were signed in as one.

**Teams**

| Team | Countries | Restricted incident |
|---|---|---|
| smoke team (`Access Control Smoke`) | none | `Access Control Smoke Restricted Incident` (holds the post-cutoff report) |
| Team A | France (FR) | `Access Control Smoke Team A (FR) Incident` |
| Team B | Mexico (MX) | `Access Control Smoke Team B (MX) Incident` |
| Team C | France, Mexico | `Access Control Smoke Team C (FR, MX) Incident` |

**Incidents**: `Access Control Smoke Public Incident` is visible to anyone with view data. Each restricted incident is visible only to admins and that team's members, and editable by admins and members whose team role grants edit.

**Sources**: `Access Control Smoke Source` (public), `=Access Control Smoke Formula Source` (public, no reports; its name checks CSV formula escaping), plus `... France Source` (country_restricted to FR) and `... Mexico Source` (country_restricted to MX), each with one report. Members of a team see country-restricted sources whose countries overlap their team's. Editing those reports also needs edit rights on a team that covers the country.

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

Teams, memberships, sources, incidents and users are all defined in `backend/scripts/access-control-fixtures.js`. Add to that file to cover new cases; the seed, matrix and screens pick them up from there.

## API matrix

```bash
npm run smoke:access:matrix
npm run smoke:access:matrix -- --only=incident     # only checks whose name contains "incident"
AGGIE_API_URL=http://127.0.0.1:3000 npm run smoke:access:matrix
```

What it checks, for every user:
- **Reading data:** reports, incidents (public, smoke team, Teams A/B/C), sources, tags, dashboard, trends
- **Editing data:** reports with no team, reports in a team incident, public and team incidents, releasing a report batch
- **Country access:** viewing the France and Mexico sources, and viewing and editing their reports
- **Settings and sources:** credentials, settings, deleting sources and tags
- **Users and teams:** user directory, user list, editing and deleting users, deleting teams, the permissions editor
- **KPIs:** viewing KPIs, exporting them, and viewing Team A's KPIs. Expected results come from `getKpiAccess` and `canExportKpis` in `backend/access/kpiAccess.js`.

In the terminal, each cell shows `allow` or `-` (denied) when the result matches what's expected; the HTML report shows `allow` or `deny`. A mismatch shows the actual result in caps with `!` (`ALLOW!`, `DENY!`, `ERROR!`). The mismatches are listed with HTTP status codes under the grid, and the script exits non-zero.

Expected results come from `hasPermission` in `backend/access/permissions.js` and team roles from `backend/access/teamMemberships.js`, so changing the role map changes the expectations too. Checks whose route adds team scope or controller rules use an `expect(u)` function instead (see the comments in `CHECKS`).

**Adding a check:** append one entry to `CHECKS` in `backend/scripts/access-control-matrix.js`. Rules that keep reruns safe:
- Point deletes and other destructive calls at `MISSING_ID`. An allowed request reaches the controller and gets a 404, so nothing is deleted.
- Mutations on fixtures write back the values the seed stored (for example, incident notes).
- Never add bulk routes like `DELETE /api/source/_all` or `/api/group/_all`, or anything that changes global settings.
- If a route returns 404 to hide a document the user can't see, set `hidden: true` so a 404 counts as denied.

**Coverage guard:** before it runs, the matrix compares `ACCESS_COVERAGE` in `backend/scripts/access-control-fixtures.js` against the schemas: Source and Group `accessPolicy.mode` values, team membership roles, and Team fields. If you add a restriction (a new mode, or a Team field like `countryCodes`), the matrix stops and names it. To clear it, add fixtures and `CHECKS` for it, update this runbook and `docs/access-control/`, then list it under `covered`. If testing is deferred, list it under `knownGaps` instead, and add it to [Coverage gaps (TODO)](#coverage-gaps-todo); a Team field that doesn't control access goes under `notAccess`.

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

`--only=kpi` runs the KPI rows of the grid plus the KPI checks; any other `--only=` filter skips the KPI checks. Each run that includes the KPI checks saves their results to `scratchpad/access-control-kpi-results.json` (gitignored), which the screens report shows. The screens script runs only the grid, so it never adds KPI data. The KPI checks leave fixture reports, a fixture incident per run, and KPI events behind until cleanup.

## UI screens

```bash
npm run smoke:access:screens
npm run smoke:access:screens -- --only=settings
npm run smoke:access:screens -- --no-open     # don't open the report in a browser
AGGIE_APP_URL=https://localhost:8000 npm run smoke:access:screens
```

It first runs the API matrix grid (the same checks as `smoke:access:matrix`, against `AGGIE_API_URL`, without the KPI checks), then captures screenshots 4 users at a time, printing a line per page. When it finishes, it opens the report in your default browser.

Output goes to `scratchpad/access-control-screens/` (gitignored), which is wiped at the start of each run. The report is `index.html` there. It's rewritten as each user finishes and on Ctrl+C, so you can open it mid-run. It shows when the run started and finished, then three sections:
- **Screenshots:** rows are pages, columns are users. Each cell shows the path the page ended on. A redirect (for example, to the default page because the route isn't available to that role) is highlighted in orange.
- **API permission matrix:** the terminal grid as a table. Mismatches are red and show the expected result and HTTP status.
- **KPI checks:** the results saved by the last `npm run smoke:access:matrix`, with when it ran. Screens doesn't run the KPI checks itself (they create data), so rerun the matrix to refresh this section. Seeding and cleanup delete the saved results.

To cover a new page, add it to `PAGES` in `scripts/access-control-screens.js`.

The script uses the Playwright already in `package.json`. If Chromium is missing, run `npx playwright install chromium`.

## Manual walkthrough

The matrix and screens don't cover incident attachments or the incident access selector. Check those by hand (this also works as a live demo):

1. Sign in as `smoke_access_admin`. Open Incidents and confirm all five smoke incidents are listed: the public one and the four team-restricted ones.
2. Edit `Access Control Smoke Restricted Incident` and confirm it shows the Restricted badge with the smoke team selected.
3. Add a comment attachment to it and copy the attachment URL.
4. Sign in as `smoke_access_alpha`. Confirm both incidents are visible, the restricted one can be edited, and only the smoke team is offered in the access selector.
5. Sign in as `smoke_access_outsider`. Confirm only the public incident is listed.
6. Paste the restricted incident URL. It should be denied.
7. Paste the attachment URL. It should be denied.

API checks while signed in as the outsider. The seed prints the ID as `Restricted incident: <id>`. Both should be denied without returning incident content:

```text
GET /api/group/RESTRICTED_INCIDENT_ID          # also covered by the matrix
GET /api/report?groupId=RESTRICTED_INCIDENT_ID
```

## Coverage gaps (TODO)

These access rules are enforced in the app but no smoke check tests them, so the matrix reports "All checks match" even if one breaks. The first five are listed in `ACCESS_COVERAGE.knownGaps`. Ordered by risk: the first two silently remove permissions.

- [ ] **Team permission limits** (`Team.permissionLimits.deny`). A team-wide deny list set on the team settings page (`src/pages/Settings/team/TeamDetails.tsx`). Denying `edit data` on a team removes it from every member's team role there, leads included (`getTeamPermissions` in `backend/access/teamMemberships.js`). No fixture team has limits. To cover it: a team with `permissionLimits.deny: ['edit data']`, a monitor and a lead on it, and view/edit checks on its incident.
- [ ] **Per-team permission overrides** (`User.teamMemberships[].permissionOverrides`, `backend/models/user.js`). Each membership can allow or deny `view data`, `edit data`, or `manage incident access` on that one team, applied in `getTeamPermissions`. No fixture uses them, and the coverage guard doesn't watch this field, so a change here wouldn't trip it. To cover it: a monitor whose membership denies `edit data`, a viewer whose membership allows it, plus a `teamMembershipOverrides` entry in `ACCESS_COVERAGE`.
- [ ] **Team viewer role** (`teamRoles: viewer`). A team viewer can read the team's restricted data but not edit it. Every fixture team member is a monitor or a lead; the `viewer` user has the global viewer role and no team. To cover it: a user who is `viewer` on the smoke team, so the existing team incident checks pick it up.
- [ ] **Team-restricted sources** (`sourceModes: restricted`). Only admins and members of the source's teams see its reports. No fixture source uses this mode; the team-restricted checks that exist cover incidents, not sources. To cover it: a source restricted to Team A with one report, and view/edit checks on it.
- [ ] **Public-until sources** (`sourceModes: public_until`). Public before a cutoff date; reports on or after it are limited to the assigned teams. The seed creates before and after reports and prints a cutoff, but seeds the source as `public`, so the cutoff never applies. To cover it: seed a `public_until` source with `CUTOFF_DATE` and the smoke team, then check that the before report is visible to everyone and the after report only to the team.
- [ ] **Inactive teams** (`teamFields: active`). An inactive team's countries stop granting access to country-restricted sources (`backend/api/utils/sourceAccessUser.js`), and an incident can't be restricted to one (`backend/api/middlewares/incidentAccessMiddlewares.js`). All fixture teams are active. To cover it: an inactive team covering a country, a member of it, and a check that they can't see that country's source.
- [ ] **Doc fix:** `docs/access-control/access-control-permissions-matrix.md` says individual overrides "are not per-team overrides." Per-team overrides exist (see above). Update that line.

When an item is covered, move its value from `knownGaps` to `covered` in `ACCESS_COVERAGE`, update the fixture tables and "What it checks" above, and delete the item here.

## Testing a feature branch

The scripts are on `feat/access-smoke-tests` until it merges into `development`. To QA a feature branch, merge `development` (or the smoke-test branch) into it, then add checks for the branch's new permissions and pages there, so they ship with the feature.

## Cleanup

```bash
ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:cleanup
```

Cleanup also deletes KPI events made by smoke users or about smoke fixtures (signups, logins, triage from the KPI checks), so test activity doesn't stay in the KPI totals. Seeding runs cleanup first, so reseeding clears them too.
