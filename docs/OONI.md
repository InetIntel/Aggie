# OONI integration

Aggie polls OONI's public aggregation API for Iran `web_connectivity`
measurement volume on AS44244 (IranCell) and AS58224 (MCCI). Alerts enter the
normal Aggie report pipeline and use deterministic daily GUIDs, so repeated
polling does not create duplicate reports.

## Alert rules

For an alert date `D`, only completed UTC days are evaluated:

Aggie creates a `zero_measurements` alert when the measurement count on `D-1`
is zero. OONI omits zero-count days from its response, so missing calendar dates
are filled with zero before evaluation. Production polling waits until 06:00 UTC
before evaluating the previous UTC day, reducing false alerts while OONI
finishes publishing daily aggregates.

## Configure Aggie

1. Open Settings, then Credentials.
2. Create an `ooni` credential. OONI is public, so no token is requested.
3. Open Settings, then Sources.
4. Create an `ooni` source and select the credential.
5. Keep the default ASN list `44244 58224`.
6. Enable the source and turn global fetching on.

OONI alerts appear as normal reports with media type `OONI`. Report metadata
contains the ASN, alert type, date, and zero measurement count. The report link
opens the corresponding OONI Explorer query.

## Historical backtest

Run the same evaluator used by the production channel:

```powershell
npm run backtest:ooni -- 2026-07-30
```

The optional date is the alert date through which to evaluate. Output is written
to the ignored `data/ooni-alert-backtest.json` and
`data/ooni-alert-backtest.csv` files.

The backtest emits only zero-measurement alerts. There is no additional cooldown
or incident-level suppression.