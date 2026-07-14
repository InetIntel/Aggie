# Access Control Working Notes

## What we are trying to solve

Aggie already has some role-based permissions. Users have roles like `admin`, `team_lead`, `monitor`, and `viewer`, and the code already uses checks like `User.can(...)`.

That part should probably stay. The bigger issue is that the current setup seems built around a mostly trusted single team. The direction from the meetings is broader than that. Aggie may need to support multiple teams, outside collaborators, researchers, monitors, and possibly public viewers or journalists.

So the main access-control problem is not just:

> Can this user edit data?

It is also:

> Which data should this user be able to see or edit?

That is the part we need to add carefully.

## Basic model

The simplest way to think about it is:

* roles decide what a user can do
* teams or groups decide what a user can access

For example, a monitor might be allowed to edit data, but only for the team or region they are assigned to.

This keeps the existing RBAC system useful while adding the missing scope layer.

## Roles

The current roles seem mostly reasonable as a starting point.

Rough understanding:

* `admin`: platform-level access and configuration
* `team_lead`: manages a team or area of work
* `monitor`: trusted user who watches alerts, tags items, and contributes
* `viewer`: read-only user, possibly including non-technical users or journalists

There may also be a need for a `contributor` role later. That would be someone who can submit information but cannot publish it directly.

One thing that came up in the notes is that team leads should not have unlimited access to everything. They should be able to manage their own team’s users and resources, but not credentials, sources, or records owned by other teams.

## Teams / groups

The next step is probably some kind of team or group scope.

A first version could use a `Team` model:

* users can belong to one or more teams
* resources belong to one team
* admins can see everything
* non-admin users only see records tied to their teams
* existing data gets moved into a default `Legacy` team

Resources that likely need a team field:

* users
* credentials
* sources
* reports
* incidents/groups

Reports should probably inherit their team from the source that created them. Incidents/groups should probably belong to one team and only contain reports from that same team.

One thing to clarify: the meetings also talked about “groups” more flexibly, like groups based on region, skill set, or trust level. That may or may not be the same thing as “teams.” For a first implementation, a formal team model may be easier. More flexible groups could come later if needed.

## Incidents and public/private information

The meeting notes suggest that incidents may need more than simple team ownership.

There was discussion of Aggie becoming more like a shared incident log or ticketing system. In that model, some information may be public enough for a journalist or outside viewer, while other material should stay internal.

For example:

Public or broadly visible:

* incident summary
* public IODA links
* public social media references
* published updates

Internal or restricted:

* screenshots from private tools
* analyst notes
* uncertain reports
* private corroborating evidence
* draft comments

This probably means that long term, incidents may need both a public-facing side and an internal working side.

That said, I would not try to solve all of that in the first implementation. Team/group scope is probably the safer first step.

## Review / publishing workflow

Another thing from the notes is that contributors may need a review process.

Possible flow:

* draft
* submitted for review
* approved
* published
* returned for edits

This would let contributors or monitors add information without making it final immediately. A team lead or admin could review it for accuracy, tags, spelling, and general quality before it becomes public or official.

There was also a concern about preserving the integrity of an analyst’s work. Admins should probably not silently impersonate another user or overwrite their writing without some kind of notice. If someone higher up edits a user’s contribution, the original author may need to be notified or able to review the change.

This is related to access control, but it is probably a separate phase.

## Tags

Tagging needs more discussion.

The notes suggest contributors should be able to use existing tags, but probably should not create new tags freely. That makes sense because unrestricted tag creation could get messy quickly.

Possible approach:

* contributors/monitors can apply existing tags
* admins or team leads create approved tags
* users can request new tags when needed

Tags may also matter for long-running incidents. A long shutdown or protest may not fit cleanly into one incident thread. It may make more sense to use tags to connect smaller events over time and across regions.

## Backend work

The backend should probably have shared helper functions for access checks instead of repeating the same logic in every controller.

Helpers could handle:

* getting the teams/groups a user belongs to
* adding team filters to Mongo queries
* checking whether a user can access a specific record
* validating team assignment when something is created or updated
* letting admins bypass team filters where appropriate

The direct access case is important. Filtering list views is not enough if someone can still request a record by ID.

Areas that likely need access checks:

* users
* credentials
* sources
* reports
* incidents/groups
* CSV exports
* visualizations
* socket updates

## Frontend work

The frontend will need to show and use the access model clearly.

Likely changes:

* include the current user’s teams/groups in session data
* require team selection when creating scoped resources
* only show team options the current user can use
* hide or disable actions the user cannot perform
* show whether something is public, internal, or restricted if that model is added later

Forms that may need team selection:

* create user
* create credential
* create source
* create incident/group

## Migration

If team scope is added, existing data needs a team.

The simplest path is to create a `Legacy` team and put existing records there.

Migration would likely:

* create a `Legacy` team
* assign existing users to it
* assign existing credentials, sources, reports, and incidents/groups to it
* backfill report team from source when possible
* fall back to `Legacy` when the team cannot be inferred
* add indexes on team fields that will be filtered often

Admins should still be able to see all migrated data.

## Suggested order

A practical order might be:

1. Keep using the existing `User.can(...)` role checks.
2. Fix obvious missing permission checks in existing routes.
3. Write down the intended team/group scope model.
4. Add a `Team` model.
5. Add team membership to users.
6. Add team fields to credentials, sources, reports, and incidents/groups.
7. Add shared backend helpers for team access.
8. Apply team filters to list endpoints.
9. Add direct access checks for view/edit/delete by ID.
10. Update frontend types and forms.
11. Add a migration for existing data.
12. Add tests for admin, team lead, monitor, and viewer behavior.
13. Revisit public/private incident views and review workflows after the basic scope model is working.

## Open questions

Things that still need confirmation:

* Are teams and groups the same thing?
* Should viewers include journalists or only internal read-only users?
* Can viewers see comments, or only published summaries?
* Do we need a separate contributor role?
* Should incidents have both public and internal sections?
* Should screenshots or evidence have separate visibility from the incident?
* Who can publish incident updates?
* Can team leads edit all content in their team?
* Should admins be able to directly edit another analyst’s writing?
* Who can create tags?
* Should long-running incidents be one incident or smaller linked events?

## Testing goals

Tests should eventually confirm:

* admins can access everything
* team leads are limited to their own teams
* monitors and viewers only see what they should see
* users cannot access another team’s records by direct ID
* credentials and sources do not leak across teams
* reports inherit team information correctly
* incidents/groups do not mix reports from different teams
* exports, visualizations, and socket updates respect access rules

## Current recommendation

Start with the existing role system and harden it where needed. Then add team or group scope as the next layer.

The more advanced pieces like public/private incident sections, content-level visibility, review queues, pinned comments, and long-incident workflows should probably come after the basic scoped access model is working.
