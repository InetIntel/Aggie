# Access Control Working Notes

The main change is that roles and team access are now separate. Roles decide what someone is allowed to do. Team membership decides which restricted sources and incidents they can do it with.

## Roles and teams

We kept the existing account roles as the default permission levels. We added a role to each team membership so the same user can have different responsibilities on different teams.

The available team roles are viewer, monitor, and team lead. A team viewer can read that team's restricted data. A team monitor can also work with it. A team lead can manage the team and its access settings.

Team leads can add or update members on teams they lead. They can also create viewer and monitor accounts for those teams. The existing global team-lead role has not been removed.

Admins still have full access and can set individual permission overrides for a user.

## Sources and reports

A source can be public, restricted to selected teams, or public until a cutoff date. Reports follow the source setting instead of having their own separate access setting.

The source rules are used for report lists, direct report links, searches, comments, batches, bulk changes, exports, and links between reports and incidents.

If a source has no access setting, it stays public. This keeps the change from hiding older data by default.

## Incidents

An incident can be public or restricted to selected teams. The same access check is used for incident lists, direct links, edits, comments, attachments, deletion, and report linking.

A report does not automatically become restricted just because it is linked to a restricted incident. Users who can see the report but not the incident receive the report without the incident reference.

## Related access checks

Incident socket updates do not send the incident itself. They tell the client to reload it through the API, where access is checked normally.

Global visualization totals require the `manage trends` permission because those totals are not stored by team.

Tags remain separate from access control. Adding a tag does not give or remove access.
