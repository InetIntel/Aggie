---
paths:
  - "backend/access/**"
  - "backend/models/source.js"
  - "backend/models/group.js"
  - "backend/models/team.js"
  - "backend/models/user.js"
  - "backend/api/middlewares/incidentAccessMiddlewares.js"
  - "backend/api/middlewares/scopedPermissionMiddlewares.js"
  - "backend/api/utils/*Access*.js"
---

# Access-control changes need smoke test coverage

When a change adds or alters an access restriction, tell the developer the access-control smoke tests and docs need updating, and offer to do it. Examples: a new `accessPolicy.mode` on Source or Group, a new Team field that limits access (like `countryCodes`), a new team membership role, or new rules in `backend/access/` or the access middlewares.

What to update:

- `backend/scripts/access-control-fixtures.js`: fixtures (teams, sources, incidents, users) that exercise the restriction, and its entry in `ACCESS_COVERAGE`.
- `backend/scripts/access-control-matrix.js`: `CHECKS` entries for the new allow/deny cases.
- `docs/claude/runbooks/access-control-smoke-tests.md`: the Teams, Sources, Users tables and the "What it checks" list.
- `docs/access-control/`: current-state, working notes, and the permissions matrix (including its access-modes table).

`npm run smoke:access:matrix` refuses to run while a schema has a mode, team role, or Team field that isn't listed in `ACCESS_COVERAGE`, so flag this before the developer hits that error. If coverage is deferred, add the value to `knownGaps` rather than `covered`, and add an item to "Coverage gaps (TODO)" in the runbook.

Don't run the smoke scripts yourself; give the developer the commands (see the runbook).
