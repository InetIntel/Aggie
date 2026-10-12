# Alerts location filters

The Alerts page supports searchable multi-select countries, ASNs, and regions.
Values within each filter are ORed; active filters are ANDed with each other and
the existing alert filters. Empty selections impose no restriction. Selections
live in the URL; changing them resets pagination. Both list and table views use
the same server query, including its counts and deduplication.

`GET /api/report/filter-options` returns options from outage alerts visible under
the caller's source access rules, across all pages. Options are independent of
the current filters so changing one selection cannot remove another selection.
Region labels include the country where known. ASN labels include the network
name where available. Country/region filtering excludes unknown geography.

New IODA, Cloudflare, and OONI alerts retain `countryCode` from their source
configuration. New IODA regional alerts also retain `regionId` as `ioda:<code>`.
ASNs use the existing `as<number>` format. Query parameters are `countries`,
`asns`, and `regions`, serialized as comma-separated values.

No historical data is rewritten. Read-time fallbacks use OONI probe country,
recognized country names or the existing geographic scope catalog, and IODA raw
region entity paths. Historical alerts without reliable metadata remain visible
when no corresponding geographic filter is active. The country on an ASN alert
represents its configured collection context, rather than proof of a global
network outage's geographic extent.

Validation: `node --test backend/shared/alertLocations.test.js
backend/fetching/channels/ooni.test.js`, `npx tsc --noEmit`, and `npm run build`.
