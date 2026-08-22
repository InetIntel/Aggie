# Access Control Current State

## What is implemented

Aggie now has an access-control path that connects users, teams, sources, reports, and incidents.

- Users can have a separate viewer, monitor, or team-lead role on each team.
- Teams can have scoped leads, while the legacy global `team_lead` role remains supported during migration.
- Scoped leads can manage their own team membership and create viewer or monitor accounts for teams they lead.
- Roles act as permission templates, and administrators can add or deny individual permissions per user.
- Source policies support `public`, `restricted`, and `public_until` modes.
- Source policies are enforced across report lists, searches, details, comments, batches, and bulk actions.
- Incident policies support `public` and `restricted` modes.
- Restricted incidents can be assigned to one or more teams.
- Incident lists, direct URLs, edits, deletion, bulk actions, tags, comments, and report linking enforce the incident policy.
- Incident comment attachments check access to their parent incident before download.
- Incident socket events contain no incident data; clients refetch through the protected API.
- CSV exports apply the same source visibility filter as report lists.
- Global precomputed visualizations require the dedicated Manage Trends permission because their stored totals cannot yet be separated by team.

## Defaults and compatibility

Existing sources and incidents without an access policy are treated as public. No migration is required to preserve existing visibility.

Existing team assignments without a scoped role continue to use the user's account role until the optional membership backfill is applied.

The older incident `public` field still represents the existing publication/deletion behavior. The new `accessPolicy` field is separate and controls team visibility.

Administrators can access every restricted item. Members can access incidents assigned to their teams. Scoped team leads can also access and manage policies for teams they lead.

## Incident access controls

Authorized users can select one of two modes in the incident create/edit form:

- `public`: normal authenticated access
- `restricted`: access for administrators and selected team members or leads

The `manage incident access` permission is included in the administrator and legacy team-lead templates. It can also be granted as an individual override. Scoped leads receive team-limited policy management through their team assignment.

## Verification

The access-control unit suite covers legacy public behavior, administrators, team members, outsiders, scoped leads, permission overrides, and query filters. The production frontend build and TypeScript checks pass.

The disposable smoke fixture script creates:

- an administrator
- a scoped Team Alpha lead
- an outsider
- a source and sample reports
- a public incident
- a Team Alpha restricted incident with a report and comment

## Remaining follow-up

- Run the full browser smoke test with the three fixture accounts.
- Add an uploaded attachment during the smoke test and verify a copied URL is denied to the outsider.
- Review whether report responses should hide references to restricted incident IDs when the report itself remains public.
- Replace the legacy global team-lead fallback after real team assignments have been verified.
