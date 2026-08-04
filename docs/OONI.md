# OONI integration

Aggie polls OONI's public aggregation API for Iran `web_connectivity`
measurement volume on AS44244 (IranCell) and AS58224 (MCCI). Alerts enter the
normal Aggie report pipeline and use deterministic daily GUIDs, so repeated
polling does not create duplicate reports. When both rules trigger for an ASN
on the same date, they are grouped into one report.

## Alert rules

For an alert date `D`, only completed UTC days are evaluated:

1. `zero_measurements`: the measurement count on `D-1` is zero. OONI omits
   zero-count days from its response, so missing calendar dates are filled with
   zero before evaluation.
2. `measurement_decline`: the mean for `D-2` through `D-1` is at least 30%
   below the mean of non-zero counts from `D-16` through `D-3`.

The two windows are disjoint. A day can produce both alert types. Production
polling waits until 06:00 UTC before evaluating the previous UTC day, reducing
false zero alerts while OONI finishes publishing daily aggregates.

## Configure Aggie

1. Open Settings, then Credentials.
2. Create an `ooni` credential. OONI is public, so no token is requested.
3. Open Settings, then Sources.
4. Create an `ooni` source and select the credential.
5. Keep the default ASN list `44244 58224`.
6. Enable the source and turn global fetching on.

OONI alerts appear as normal reports with media type `OONI`. Report metadata
contains the ASN, alert type, daily counts, baseline average, recent average,
and decline fraction. For decline alerts, the detail view also includes up to
five confirmed and five non-confirmed anomalous measurements from the recent
two-day window. These measurements provide context and are not presented as the
cause of the volume decline. A zero-only alert has no same-day tests to attach.
The report link opens the corresponding OONI Explorer query.

## Historical backtest

Run the same evaluator used by the production channel:

```powershell
npm run backtest:ooni -- 2026-07-30
```

The optional date is the alert date through which to evaluate. Output is written
to the ignored `data/ooni-alert-backtest.json` and
`data/ooni-alert-backtest.csv` files.

For December 1, 2025 through July 30, 2026, the grouped backtest produced:

| ASN | Reports | Zero triggers | Decline triggers |
| --- | ---: | ---: | ---: |
| AS44244 (IranCell) | 124 | 89 | 115 |
| AS58224 (MCCI) | 109 | 98 | 68 |
| Total | 233 | 187 | 183 |

Grouping produces 137 fewer reports than emitting each trigger separately, a
37% reduction. There is no additional cooldown or incident-level suppression.