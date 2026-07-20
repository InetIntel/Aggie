# Alerts table: turn the "Source" column into "ASN / Network"

## Context

On the alerts table, the **Platform** and **Source** columns look duplicated for outage
alerts. Investigation confirmed they are *not* literally the same field, but they overlap:

- **Platform** ([reportColumns.tsx:41-45](src/pages/Reports/TableView/reportColumns.tsx#L41-L45)) renders an **icon** from `report._media[0]` (`ioda` / `cloudflare` / social types).
- **Source** ([reportColumns.tsx:26-32](src/pages/Reports/TableView/reportColumns.tsx#L26-L32)) renders text from `reportSource()`, which for IODA returns the literal `"IODA"` and for Cloudflare returns `dataSource || "Cloudflare"` — i.e. just the platform name again.

So for IODA/Cloudflare rows the Source column is redundant with the Platform icon.

**Goal:** keep Platform as the IODA/Cloudflare indicator, and repurpose the Source column
to show the **ASN** and the **network name** of the outage — the information that actually
distinguishes one outage alert from another.

Per the user's choices: **stacked cell** (ASN emphasized on top, network name truncated
below) and rename the column header to **"ASN / Network"**.

## Key finding: all data is already available, no backend change needed

Both outage channels store the same shape and the list endpoint already returns it:

- `report.asn` — string like `"as15169"` (schema [report.js:18](backend/models/report.js#L18), copied in [postToReport.js:41](backend/fetching/hooks/postToReport.js#L41)). `null` for country/region-scoped (non-ASN) outages.
- `report.metadata.rawAPIResponse.entityName` — always `` `${networkName} - ${entityScope}` `` for both channels ([ioda.js:343/352](backend/fetching/channels/ioda.js#L343), [cloudflare.js:274](backend/fetching/channels/cloudflare.js#L274)).
- `report.metadata.rawAPIResponse.entityScope` — the geo scope suffix ([ioda.js:400](backend/fetching/channels/ioda.js#L400), [cloudflare.js:306](backend/fetching/channels/cloudflare.js#L306)).

The list serializer spreads the whole document incl. full `rawAPIResponse`
([reportController.js:82-91](backend/api/controllers/reportController.js#L82-L91)), so `asn`,
`entityName`, and `entityScope` are all present on rows in the alerts table. **No backend or
DB changes, and it works on existing/historical alerts.**

Network name is derived uniformly for both platforms: strip the trailing
`` ` - ${entityScope}` `` from `entityName`.

## Changes (all frontend, one primary file)

### 1. `src/pages/Reports/TableView/reportColumns.tsx`

**a. Replace `reportSource()` with a network resolver.** Keep the social-media branch intact;
change the IODA/Cloudflare branch to return structured ASN + network name.

```ts
// Returns the ASN + network name for outage alerts (ioda/cloudflare),
// falling back to author/nickname for social reports.
export const reportNetwork = (report: Report): { asn: string; network: string } => {
  const media = report._media?.[0];
  if (media === "ioda" || media === "cloudflare") {
    const raw = report.metadata?.rawAPIResponse;
    const scope = raw?.entityScope ?? "";
    const entityName = raw?.entityName ?? report.author ?? "";
    const network =
      scope && entityName.endsWith(` - ${scope}`)
        ? entityName.slice(0, entityName.length - ` - ${scope}`.length)
        : entityName;
    const asn = report.asn ? report.asn.toUpperCase() : ""; // "as15169" -> "AS15169"
    return { asn, network };
  }
  return { asn: "", network: report._sourceNicknames?.[0] || report.author || "" };
};
```

- Keep the existing `reportSource()` export as a thin wrapper (or update its call sites) if it's referenced elsewhere — grep first; if only used by this column, replace it outright.
- For non-ASN-scoped outages (`report.asn` null, `entityName` = `"Region - X"` / `"Country - X"`), `asn` is empty and `network` shows the region/country label — the cell degrades gracefully to a single line.

**b. Add a `SourceCell` (rename conceptually to network) stacked component**, mirroring the
existing `PlatformCell`/`StatusCell` pattern in this file:

```tsx
const NetworkCell = ({ report }: { report: Report }) => {
  const { asn, network } = reportNetwork(report);
  if (!asn && !network) return dash;
  return (
    <div className='flex flex-col items-start leading-tight'>
      {asn && (
        <span className='font-medium text-slate-700 dark:text-gray-300'>{asn}</span>
      )}
      {network && (
        <span className='block truncate text-slate-500 dark:text-gray-400'>{network}</span>
      )}
    </div>
  );
};
```

**c. Update the `source` column definition** ([reportColumns.tsx:137-148](src/pages/Reports/TableView/reportColumns.tsx#L137-L148)):
- `header: "ASN / Network"`
- `spilloverLabel` (if present) → `"ASN / Network"`
- `cell: (report) => <NetworkCell report={report} />`
- Widen slightly for the network name: bump `thClassName`/`tdClassName` from `w-28` / `max-w-[7rem]` to roughly `w-36` / `max-w-[9rem]` (verify against the table layout — the stacked format keeps height, not width, so a modest bump is enough).

### 2. `src/api/reports/types.ts`

- Add `asn?: string;` to the `Report` interface ([types.ts:9-33](src/api/reports/types.ts#L9-L33)).
- Optionally tighten `RawApiResponse` ([types.ts:90-98](src/api/reports/types.ts#L90-L98)) with `entityName?: string;` and `entityScope?: string;`. Not strictly required — the interface already has a `[key: string]: any` catch-all — but adds type safety for the new access.

### Reuse notes
- Mirror the local cell-component pattern already in `reportColumns.tsx` (`PlatformCell`, `StatusCell`, `SignalCell`) — no new files needed.
- `dash` ([reportColumns.tsx:23](src/pages/Reports/TableView/reportColumns.tsx#L23)) is the shared empty-state element; reuse it.
- Do **not** touch the channels, the report model, or the controller.

## Verification

1. `npm run dev`, open the alerts table (Reports page with `alerts=true`).
2. Confirm IODA and Cloudflare rows show a stacked cell: **AS##### on top**, **network name below** (e.g. `AS15169` / `Google LLC`), under the **"ASN / Network"** header, while the Platform column still shows the correct icon — no more duplicated "IODA"/"Cloudflare" text.
3. Check an ASN-scoped Cloudflare alert and an ASN-scoped IODA alert (both `geoasn-*` and `asn-country` query types) render a sensible network name with the scope suffix stripped.
4. Check a country/region-scoped outage (no ASN) degrades to a single-line label, and a normal social-media report still shows its author/nickname unchanged.
5. Long network names truncate within the column without breaking row height; `dash` shows when neither ASN nor network is present.

## Out of scope / noted
- The `_sourceNicknames` schema field is defined but never populated anywhere in the backend — that's a separate latent gap, not addressed here.
