# Access Control Permissions Matrix

## Current roles

Aggie currently uses these main user roles:

- admin
- team_lead
- monitor
- viewer

The access-control work is currently focused on connecting these roles to teams and source access rules.

## Current behavior

| Area | Admin | Team Lead | Monitor | Viewer |
|---|---|---|---|---|
| View own user profile | Yes | Yes | Yes | Yes |
| Update own user profile | Yes | Yes | Yes | No |
| View all users | Yes | Limited | No | No |
| Create users | Yes | No | No | No |
| Assign users to teams | Yes | Limited | No | No |
| View teams | Yes | Yes | No | No |
| Create teams | Yes | Yes during current testing | No | No |
| Delete teams | Yes | Yes during current testing | No | No |
| View team detail page | Yes | Yes | No | No |
| View source access policy fields | Yes | Yes | No | No |
| Configure source access policy | Yes | Yes during current testing | No | No |

## Notes

The current `team_lead` role is still being reviewed.

Right now, `team_lead` works as a global role. That makes testing easier, but it is probably too broad for the final model. A better long-term model may be for admins to assign someone as the lead of a specific team.

That would make the structure closer to:

- admin = global manager
- team lead = manager inside one assigned team
- monitor/viewer = normal team members

## Source access modes

Sources now support initial access policy metadata.

| Mode | Meaning |
|---|---|
| public | Source is broadly visible |
| restricted | Source is restricted to selected teams |
| public_until | Source is public until a cutoff date, then restricted |

