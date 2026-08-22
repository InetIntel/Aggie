# Access Control Meeting Demo

This smoke test creates disposable users, a team, reports, and two incidents. Run it only against a local or disposable database.

## Prepare the fixtures

In PowerShell, from the Aggie repository:

```powershell
$env:ACCESS_CONTROL_SMOKE_FIXTURES = "true"
npm run smoke:access:seed
```

Start Aggie normally after the seed finishes.

All fixture accounts use this password:

```text
AggieSmokeTest!2026
```

The accounts are:

- `smoke_access_admin`
- `smoke_access_alpha` — monitor and scoped lead of the smoke-test team
- `smoke_access_scoped_monitor` — global viewer and monitor on the smoke-test team
- `smoke_access_outsider` — monitor with no team

## Demonstrate the behavior

1. Sign in as `smoke_access_admin`.
2. Open Incidents and confirm that both smoke-test incidents are listed.
3. Edit the restricted incident and show its Restricted badge and selected team.
4. Add a comment attachment to the restricted incident and copy its attachment URL.
5. Sign in as `smoke_access_alpha` and confirm that both incidents are visible.
6. Show that Alpha can edit the restricted incident and has only its led team available in the access selector.
7. Sign in as `smoke_access_outsider` and confirm that only the public incident is listed.
8. Paste the restricted incident URL directly and confirm that it is denied.
9. Paste the copied attachment URL and confirm that it is denied.

Optional API checks while signed in as the outsider:

```text
GET /api/group/RESTRICTED_INCIDENT_ID
GET /api/report?groupId=RESTRICTED_INCIDENT_ID
```

Both requests should be denied without returning incident content.

## Remove the fixtures

```powershell
$env:ACCESS_CONTROL_SMOKE_FIXTURES = "true"
npm run smoke:access:cleanup
```
