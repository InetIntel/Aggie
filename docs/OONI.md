# OONI integration

Aggie polls OONI's public aggregation API for Iran `web_connectivity`
measurement volume on AS44244 (IranCell) and AS58224 (MCCI). Alerts enter the
normal Aggie report pipeline and use deterministic daily GUIDs, so repeated
polling does not create duplicate reports.

## Alert rule

For an alert date `D`, only completed UTC days are evaluated. Aggie creates a
`zero_measurements` alert when the measurement count on `D-1` is zero. OONI
omits zero-count days from its response, so missing calendar dates are filled
with zero before evaluation.

Production polling waits until 06:00 UTC before evaluating the previous UTC
day, reducing false alerts while OONI finishes publishing daily aggregates.

## Configuration

OONI's API is public, but Aggie's source model requires a credential. Create a
credential with type `ooni` and no API secrets, then create a source with:

- `media`: `ooni`
- `lists`: space- or comma-separated ASNs, normally `44244 58224`
- `credentials`: the OONI credential ID
- `enabled`: `true`

The current staging Settings forms do not expose OONI, so create these records
through the authenticated credentials and sources APIs. Global fetching must
also be enabled.

OONI alerts appear as normal reports with media type `OONI`. Report metadata
contains the ASN, network name, alert date, and zero-measurement trigger. The
report URL opens the matching OONI Explorer query.

## Historical backtest

Run the same evaluator used by the production channel:

```powershell
npm run backtest:ooni -- 2026-07-30
```

The optional argument is the last alert date to evaluate. Results are written
to the ignored `data/ooni-alert-backtest.json` and
`data/ooni-alert-backtest.csv` files.

The integration emits only zero-measurement alerts. There is no incident-level
cooldown beyond one deterministic report per ASN and alert date.