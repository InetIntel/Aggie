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

OONI's API is public, but Aggie's source model requires a credential. In
Settings, create an `ooni` credential with a name and no API secrets. Then
create an `ooni` source with one or more positive ASNs separated by spaces or
commas. The normal values are `44244, 58224`.

The corresponding stored source fields are:

- `media`: `ooni`
- `lists`: space- or comma-separated ASNs, normally `44244 58224`
- `credentials`: the OONI credential ID
- `enabled`: `true`

Global fetching must also be enabled.

OONI reports are ASN-scoped outage events and appear in the Alerts view with
media type `ooni` and entity level `AS`. List, detail, table, and comparison
views show the network, ASN, measurement day, and measurement count. The report
URL opens the matching OONI Explorer query.

## Historical backtest

Run the same evaluator used by the production channel:

```powershell
npm run backtest:ooni -- 2026-07-30
```

The optional argument is the last alert date to evaluate. Results are written
to the ignored `data/ooni-alert-backtest.json` and
`data/ooni-alert-backtest.csv` files.

The integration emits only zero-measurement alerts. There is no incident-level
cooldown beyond one deterministic report per ASN and alert date. Docker
deployment, measurement-decline detection, and domain analysis are outside
this integration.