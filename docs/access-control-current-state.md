# Access Control Current State

## Quick summary

The access control work has moved past just defining user roles. The current work is mostly around teams, team membership, and starting to think through how source-level access should work.

This is still in progress, but the basic pieces are now in place for users to belong to teams and for teams to be used later when restricting sources, reports, or incident data.

## What is in place now

So far, the access control work includes:

- teams exist as backend records
- users can belong to teams
- user API responses now include team data
- teams can be listed, created, viewed, and deleted through the API
- team membership can be updated
- the Users settings page shows team membership
- users can be assigned to teams from the UI
- there is now a Teams settings page
- teams are clickable and have a detail page
- the team detail page shows members grouped by role
- early work has started on managing team members from the team detail page

This makes the team setup easier to see and test, instead of only having the data exist in the backend.

## Source access work

I also started the first source access pieces.

Current source access work includes:

- added source access policy metadata
- added frontend fields for source access policy settings
- added support for:
    - public sources
    - restricted sources
    - sources that are public until a cutoff date
- added support for tying source access policies to teams
- added a backend helper for checking source access rules

This is not fully enforced across reports/incidents yet. Right now it is more of the setup needed before source-derived data can be filtered correctly.

## Design issue found during testing

One issue that came up is the way `team_lead` is currently being used.

`team_lead` is a global user role. That works for some things, but it gets awkward once teams are involved. A user might be the lead of one team, but that does not necessarily mean they should have broad visibility or management ability over every team.

The cleaner model may be:

- admin = global / super admin
- team lead = lead of a specific team
- viewers/monitors = users assigned inside teams

This would make team leads more like mini-admins inside a team, instead of giving them broad team access everywhere.

This still needs to be worked through before the permission model is fully enforced.

## Source access design note

Sources seem like one of the bigger reasons access control is needed.

For example, a source like a Telegram account or channel may have data that was public before a certain date, but should be treated as private after that date. That is why the source access policy work includes a cutoff date option.

The rough idea is:

- teams define who has access
- sources define what is restricted
- reports/incidents that come from those sources should eventually follow those rules

## Next work

The next useful pieces are probably:

- clean up the team lead model
- keep improving the team detail page so membership management is clearer
- apply source access rules to reports/source-derived data
- later extend the same checks to incidents, exports, visualizations, and attachments
- add some basic permission test cases for admin, team lead, monitor, and viewer accounts