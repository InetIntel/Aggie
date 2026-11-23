# Per-role permission QA: remaining work

## Context
Every feature needs QA under each role (viewer, monitor, team_lead, admin), plus per-user overrides and team scoping. Two smoke scripts now do the repetitive checks: `npm run smoke:access:matrix` (backend enforcement, plus KPI checks) and `npm run smoke:access:screens` (what each role sees). How to seed, run and read them is in `docs/claude/runbooks/access-control-smoke-tests.md`. KPI coverage was planned in `docs/claude/plans/kpi-smoke-coverage.md`.

This doc tracks what the scripts don't cover yet.

## Done: incident attachments and the incident access selector
These used to be checked by hand in the runbook's "Manual walkthrough", which is now gone.

**Attachments.** Downloads go through `GET /incidents/uploads/:filename` (`backend/api.js`), authorized by `group_attachment_download` in `backend/api/controllers/groupController.js` via `canViewIncident`. It answers 404 when the user can't see the incident.
- [x] Seed (`backend/scripts/access-control-smoke.js`): write a small text file `access-control-smoke-attachment.txt` into `getUploadDir()` (`backend/api/utils/fileStorage.js`) and attach it to the restricted incident's seeded comment as `attachments: [{ path: '/incidents/uploads/<name>', ... }]` (match the `Attachment` subschema in `backend/models/group.js`). Cleanup deletes the file. Attachments live on local disk; see `docs/claude/bugs/incident-attachments-on-local-disk.md`.
- [x] Export the filename from `backend/scripts/access-control-fixtures.js` and include it in `loadFixtureIds`.
- [x] `CHECKS` entry `View team incident attachment`: `GET /incidents/uploads/<name>`, `hidden: true`, same `expect` as `View team incident`. The path is outside `/api`, but `BASE_URL` already points at the backend.
- [x] `CHECKS` entry `List reports in team incident`: `GET /api/report?groupId=<restricted>`, `hidden: true`, same `expect`. Replaces the manual API check in the runbook.
- [x] `CHECKS` entry `Upload team incident attachment`: `PATCH /api/group/_comment_add` as multipart form data (new `form(f, userKey)` check option), sent to the policy incident, same `expect` as `Edit team incident`. `expectBody` confirms an allowed upload was saved on the incident and on disk; `reset` removes the comment and deletes the file, and seed/cleanup delete any leftover `*_access-control-smoke-upload.txt`.

**Access selector.** The form is `src/pages/incidents/CreateEditIncidentForm.tsx`. Its options come from `GET /api/team/incident-access` (`team_incident_access_list` in `backend/api/controllers/teamController.js`). Changes are enforced by `requireIncidentPolicyAccess` (`backend/api/middlewares/incidentAccessMiddlewares.js`) and `canSetIncidentPolicy` (`backend/access/incidentAccess.js`).
- [x] Add an optional `expectBody(u, body, f)` to the matrix check model that returns pass/fail, so a 200 with the wrong content shows as a mismatch.
- [x] `CHECKS` entry `Incident access teams`: the returned team ids must match. Expected: every active team for admins and global team leads; otherwise the teams from `getTeamIdsWithPermission(user, 'manage incident access', ledTeamIds)` (`backend/access/teamMemberships.js`). Compute it in `buildUserContext` with the real helper, not a hand-written table.
- [x] New fixture `Access Control Smoke Policy Incident`, restricted to the smoke team, so policy changes can't disturb other checks.
- [x] Add an optional per-check `reset(f)` that the matrix runs through its open DB connection, restoring the seeded `accessPolicy`. It runs after each request, not each user, because the next policy check depends on the incident's current policy.
- [x] `CHECKS` entries `Widen incident access (add Team A)` and `Make incident public`: `PUT /api/group/<policyIncident>` with only `accessPolicy` in the body. Expected comes from `canSetIncidentPolicy` plus the edit/view scope, computed in `buildUserContext` with the real helpers. First confirm `group_update` changes nothing else with that body (it recomputes `incidentDurationSeconds`, which stays null on the fixture).
- [x] Screens: the edit form is a modal on `/incidents/:id`, so `PAGES` gained `action` (open Edit) and `verify` hooks. The `Edit public incident form` and `Edit team incident form` rows check that the selector lists exactly the expected teams. The general per-page assertions below are still open.

Done when the runbook's "Manual walkthrough" no longer lists these (keep any steps that stay manual), and "What it checks" and the fixture tables are updated.

## Coverage gaps
All covered as of this round (the runbook's list is now empty). Mirrors the runbook's "Coverage gaps (TODO)". When an item is covered, follow the runbook's steps (move it from `knownGaps` to `covered` in `ACCESS_COVERAGE`, update the fixture tables and "What it checks"), and tick it off in both places. Ordered by risk.

- [x] **Team permission limits** (`Team.permissionLimits.deny`): a team with `deny: ['edit data']`, a monitor and a lead on it, and view/edit checks on its incident.
- [x] **Per-team permission overrides** (`User.teamMemberships[].permissionOverrides`): a monitor whose membership denies `edit data`, a viewer whose membership allows it, plus a `teamMembershipFields` entry in `ACCESS_COVERAGE` so the guard watches the membership's fields.
- [x] **Team viewer role** (`teamRoles: viewer`): a `viewer` on the smoke team, so the existing team incident checks pick it up.
- [x] **Team-restricted sources** (`sourceModes: restricted`): a source restricted to Team A with one report, and view/edit checks on it.
- [x] **Public-until sources** (`sourceModes: public_until`): a separate `public_until` source with `CUTOFF_DATE` and the smoke team, with its own before and after reports; the before report is visible to everyone, the after report only to the team. The main source stays public because the KPI checks have the outsider triage a fresh report on it.
- [x] **Inactive teams** (`teamFields: active`): an inactive team covering a country, a member of it, and a check that they can't see that country's source or restrict an incident to that team.
- [x] **Doc fix:** `docs/access-control/access-control-permissions-matrix.md` says individual overrides "are not per-team overrides". Per-team overrides exist; update that line.

## Found while covering the gaps
Current behavior the checks don't encode, because it may not be intended. Decide whether each is a bug:
- **Inactive teams still grant incident access.** `canViewIncident`, `allowGlobalOrScoped` edit scope, and source `restricted`/`public_until` checks ignore `Team.active`. Only country access, the `/team/incident-access` list, and setting an incident's policy check it. No fixture incident is restricted to the inactive team.
- **Team leads don't see restricted sources through `Team.leads`.** Source `restricted`/`public_until` access uses membership teams only (`canAccessRestrictedPolicy` in `backend/access/sourceAccess.js`), while incidents also count led teams.
- **Hidden reports answer 403, hidden incidents 404.** `requireReportAccess` returns 403; incident routes return 404 to hide the document.

## Left over from the original plan
- [ ] **Per-page assertions** in `PAGES` (`scripts/access-control-screens.js`): `{ selector, expect: 'enabled' | 'disabled' | 'hidden' }`, so disabled buttons with PermissionHint are checked instead of eyeballed. Show failures in the screens report. Build on the `action` and `verify` page hooks added for the access selector check; `verify` results already show under each screenshot and in a failure list above the table.
- [ ] **Prove the matrix catches regressions** (never confirmed): locally flip one role in `PERMISSION_ROLES` (`backend/access/permissions.js`), rerun the matrix, confirm it fails on exactly those cells, then revert.
- [ ] **Check the screens against reality** (never confirmed): compare one user's screenshots against a manual login as that user.

## Plan: find what else isn't covered
The lists above are what we know about. To find the rest, do one read-only sweep per area below. Each sweep produces a short table: item, where it's enforced, which check covers it, gap. Add each gap to both Coverage gaps lists (here and in the runbook), ranked by risk. Where a sweep can be automated, extend `checkAccessCoverage` so new code trips the guard.

1. **API routes.** Every route in `backend/api/routes/*.js`, plus the non-`/api` routes in `backend/api.js` (auth, attachments, media). Record each route's guard (`User.can`, `allowGlobalOrScoped`, incident and source access middlewares, controller checks like `isAdmin`) and whether a `CHECKS` entry calls it. Flag guarded routes with no check, and routes with no guard at all.
2. **Permission keys.** Every key in `PERMISSION_ROLES` (`backend/access/permissions.js`) and every team permission in `backend/access/teamMemberships.js`, against what `CHECKS` exercise (`permission:`, `can`, `teamCan`).
3. **Access helper branches.** Each branch in `backend/access/*.js` and `backend/api/utils/sourceAccessUser.js` (for example the legacy team lead path, permission limits, inactive teams), against a fixture user that reaches it. The unit tests in `backend/access/*.test.js` list the branches.
4. **Filtered results.** Endpoints that return 200 but filter by access: the incident list (`buildIncidentAccessFilter`), report list and search, dashboard and analytics counts, trends, and exports. Most checks only look at the status code, so a leak inside a 200 passes; only `Incident access teams` and `Upload team incident attachment` use `expectBody` today. Likely fix: give these endpoints `expectBody` checks that a user's results leave out fixture ids they can't see.
5. **Socket pushes.** `backend/api/socket-handler.js` and `backend/api/sockets/`: are new reports, incident updates and source changes sent to users who can't see them? Nothing tests this today.
6. **Frontend gating.** Routes in `src/AppRouter.tsx` against `PAGES`, and UI gated on `session.permissions`, `isTeamLead` or PermissionHint against per-page assertions.
7. **Fields the guard doesn't watch.** `User.teamMemberships[].permissionOverrides` is already listed above. Look for others (for example `User.permissionOverrides`, or access-related Report and Source fields) and decide whether `checkAccessCoverage` should watch them.

Possible guard once sweep 1 is done: a route inventory that fails when a route with an access middleware has no `CHECKS` entry.
