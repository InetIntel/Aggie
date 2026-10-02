# KPI tracking

Administrators can open **Settings → KPI tracking** (`/settings/kpis`). The
admin-only API is `GET /api/analytics/kpis?start=YYYY-MM-DD&end=YYYY-MM-DD`.
Both dates are inclusive UTC dates; the default is 30 days including today,
and requests are limited to 366 days. The page exports the displayed daily
figures as CSV, including coverage and the tracking start timestamp.

## Definitions

- New accounts: successfully saved new users, including self-registration and
  admin/team-lead provisioning. Not a count of new people or first logins.
- Successful logins: completed password, WebAuthn, and TOTP authentication.
  Pending/failed MFA, credential enrollment, and session retrieval do not count.
- Unique daily login users: distinct accounts completing login that UTC day.
  The period total is user-days, not distinct users across the period and not DAU
  based on activity within an existing session.
- Incidents created: newly saved incidents, including dashboard creation.
- Alerts/social posts assigned: distinct report IDs assigned to an incident
  during that day. Reassigning or relinking the same report that day counts once.
- Investigate/ignore: distinct report IDs transitioning into each flag that day.
  Clearing flags does not count. A report can count in both flag columns.

Report classification uses `isOutageEvent === true` for alerts and otherwise
social posts. These counts use actual report IDs, not the alerts list's display
deduplication. Totals sum daily figures. Deleting records and reversing actions
do not subtract from historical counts. No content, names, emails, or credentials
are copied to the event collection.

## Deployment and reliability

The application initializes a durable tracking-start marker in `kpievents` on
startup. Days before that marker are unavailable (null/blank CSV cells), not
zero. The first day and current day may be partial. No historical backfill is
attempted: existing state cannot reconstruct past logins, assignments or flags.
No external analytics service or additional package is required.

Events are written after successful Mongoose document saves, or after completed
authentication. Current bulk report workflows save individual documents and
therefore use the same hooks. Future direct database updates, insertMany, imports
or query updates bypass these save hooks and must explicitly integrate tracking.

Telemetry writes are awaited but fail open so a committed action is not reported
as failed to the user. Domain writes and event writes are not transactional:
process termination or a database failure between them can lose an event. Failed
event writes are logged and the serving process exposes a warning until restart;
this is not a durable, fleet-wide completeness guarantee. Monitor these logs
before treating exported data as audited totals. Events have no automatic TTL;
include the collection in database backups and retention planning.

Run focused checks with:

```sh
node --test backend/api/utils/kpiReport.test.js backend/models/kpiPlugin.test.js backend/api/controllers/kpiAuth.test.js
```
