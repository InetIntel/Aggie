# Access Control Permissions

There are two role levels:

- The account role is the default for public or unscoped work.
- The team role applies when editing data restricted to that team.

Admins bypass team restrictions. Individual allow/deny overrides apply to account permissions; they are not per-team overrides.

By default, viewers can read, monitors can read and edit, legacy team leads keep their compatibility permissions, and admins have every permission.

| Action | Admin | Global team lead | Team lead | Team monitor | Team viewer |
|---|---|---|---|---|---|
| View public data | Yes | Yes | Yes | Yes | Yes |
| View data restricted to the team | Yes | If assigned or leading | Yes | Yes | Yes |
| Edit data restricted to the team | Yes | If accessible | Yes | Yes | No |
| Set incident access | Any team | Any team | Teams led | No, unless separately granted | No |
| Download a restricted incident attachment | Yes | If incident is accessible | Yes | Yes | Yes |
| Add or update team members | Yes | Compatibility access | Team led | No | No |
| Create viewer or monitor accounts | Yes | Yes | For teams led | No | No |
| Create or delete teams | Yes | Compatibility access | No | No | No |
| Configure sources | Yes | Only with an override | Only with an override | Only with an override | No |
| View global visualization totals | Yes | Only with `manage trends` | Only with `manage trends` | Only with `manage trends` | Only with `manage trends` |
| Edit permission overrides | Yes | No | No | No | No |

## Access modes

| Item | Mode | Behavior |
|---|---|---|
| Source | `public` | Normal authenticated access |
| Source | `restricted` | Assigned teams only |
| Source | `public_until` | Reports before the cutoff stay public; reports on or after it require an assigned team |
| Incident | `public` | Normal authenticated access |
| Incident | `restricted` | Incident, comments, and attachments require an assigned team |

Missing policies are treated as `public`.
