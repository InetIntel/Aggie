# Access Control Permissions Matrix

Roles provide defaults. Per-user allow or deny overrides can change individual permissions without changing a user's role.

| Area | Admin | Legacy Team Lead | Scoped Team Lead | Monitor | Viewer |
|---|---|---|---|---|---|
| View public data | Yes | Yes | Yes | Yes | Yes |
| Edit accessible data | Yes | Yes | Based on global role | Yes | No |
| View restricted incident | Yes | Assigned/led team | Assigned/led team | Assigned team | Assigned team |
| Configure incident access | Any team | Any team during migration | Teams they lead | With override | No |
| Download restricted incident attachments | Yes | Assigned/led team | Assigned/led team | Assigned team | Assigned team |
| Configure source access | Yes | With override | With override | With override | No |
| Create users | Yes | Viewer/monitor | Viewer/monitor for led teams | No | No |
| Manage team membership | Yes | Compatibility access | Teams they lead | No | No |
| Create or delete teams | Yes | Compatibility access | No | No | No |
| Edit individual permission overrides | Yes | No | No | No | No |

## Access modes

Sources support:

| Mode | Meaning |
|---|---|
| `public` | Source and its records follow normal authenticated access. |
| `restricted` | Source and its records require an assigned team. |
| `public_until` | Older records remain public; records at or after the cutoff require an assigned team. |

Incidents support:

| Mode | Meaning |
|---|---|
| `public` | Incident follows normal authenticated access. |
| `restricted` | Incident, comments, and attachments require an assigned team. |

Missing policies default to `public`, preserving all existing records and incidents.
