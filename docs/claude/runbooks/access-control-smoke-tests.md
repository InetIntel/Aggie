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

- `npm run smoke:access:matrix` calls the API as every smoke user and prints a pass/fail grid. It covers backend enforcement.
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

**Sources**: `Access Control Smoke Source` (public), plus `... France Source` (country_restricted to FR) and `... Mexico Source` (country_restricted to MX), each with one report. Members of a team see country-restricted sources whose countries overlap their team's. Editing those reports also needs edit rights on a team that covers the country.

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
- **Users and teams:** user directory, user list, editing and deleting users, deleting teams, the permissions editor, KPIs

In the terminal, each cell shows `allow` or `-` (denied) when the result matches what's expected; the HTML report shows `allow` or `deny`. A mismatch shows the actual result in caps with `!` (`ALLOW!`, `DENY!`, `ERROR!`). The mismatches are listed with HTTP status codes under the grid, and the script exits non-zero.

Expected results come from `hasPermission` in `backend/access/permissions.js` and team roles from `backend/access/teamMemberships.js`, so changing the role map changes the expectations too. Checks whose route adds team scope or controller rules use an `expect(u)` function instead (see the comments in `CHECKS`).

**Adding a check:** append one entry to `CHECKS` in `backend/scripts/access-control-matrix.js`. Rules that keep reruns safe:
- Point deletes and other destructive calls at `MISSING_ID`. An allowed request reaches the controller and gets a 404, so nothing is deleted.
- Mutations on fixtures write back the values the seed stored (for example, incident notes).
- Never add bulk routes like `DELETE /api/source/_all` or `/api/group/_all`, or anything that changes global settings.
- If a route returns 404 to hide a document the user can't see, set `hidden: true` so a 404 counts as denied.

## UI screens

```bash
npm run smoke:access:screens
npm run smoke:access:screens -- --only=settings
npm run smoke:access:screens -- --no-open     # don't open the report in a browser
AGGIE_APP_URL=https://localhost:8000 npm run smoke:access:screens
```

It first runs the API matrix (the same checks as `smoke:access:matrix`, against `AGGIE_API_URL`), then captures screenshots 4 users at a time, printing a line per page. When it finishes, it opens the report in your default browser.

Output goes to `scratchpad/access-control-screens/` (gitignored), which is wiped at the start of each run. The report is `index.html` there. It's rewritten as each user finishes and on Ctrl+C, so you can open it mid-run. It shows when the run started and finished, then two sections:
- **Screenshots:** rows are pages, columns are users. Each cell shows the path the page ended on. A redirect (for example, to the default page because the route isn't available to that role) is highlighted in orange.
- **API permission matrix:** the terminal grid as a table. Mismatches are red and show the expected result and HTTP status.

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

## Testing a feature branch

The scripts are on `feat/access-smoke-tests` until it merges into `development`. To QA a feature branch, merge `development` (or the smoke-test branch) into it, then add checks for the branch's new permissions and pages there, so they ship with the feature.

## Cleanup

```bash
ACCESS_CONTROL_SMOKE_FIXTURES=true npm run smoke:access:cleanup
```
