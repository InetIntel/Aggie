# Access Control Changes

This branch adds team-based access without replacing the roles Aggie already uses.

## Users and teams

- A user's account role is still their normal permission level.
- A user can also be a viewer, monitor, or team lead on each team they belong to.
- This means someone can be a viewer overall but still work as a monitor for one team.
- Team leads can manage members of the teams they lead and create viewer or monitor accounts for those teams.
- The existing global `team_lead` role still works.
- Admins can give or remove individual permissions without changing a user's role.

## Sources and reports

- Sources can be public, restricted to selected teams, or public until a chosen date.
- Reports use the access settings from their source.
- A missing access setting is treated as public, so existing reports do not suddenly become restricted.
- Report lists, direct links, searches, comments, bulk actions, exports, and incident linking follow the same access rules.

## Incidents

- Incidents can be public or restricted to selected teams.
- Restricted incident lists, direct links, edits, comments, attachments, and deletion all check team access.
- A public report can still be viewed when its linked incident is restricted, but the restricted incident ID is hidden from users who cannot open it.
- Incident socket messages only announce that something changed. The client reloads the incident through the protected API.

## Other behavior

- Admins can access all restricted data.
- Global visualization totals require the `manage trends` permission because the stored totals are not separated by team.
- Tags still describe content and do not control access.
