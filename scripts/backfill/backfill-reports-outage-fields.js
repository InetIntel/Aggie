// One-time (or occasionally rerunnable) backfill script for Report fields:
//  - isOutageEvent
//  - isAsnScoped
//  - asn  (normalized to "as<number>" form)
//  - outageStartedAt
//  - outageEndedAt
//  - geoScope
//
// Only updates documents where these fields are MISSING ($exists: false).

"use strict";

require("dotenv").config();

const database = require("../../backend/database");
const mongoose = database.mongoose;
const Report = require("../../backend/models/report");

const BATCH_SIZE = 200;

// Pass --dry-run to compute updates and report counts without writing.
const DRY_RUN = process.argv.slice(2).includes("--dry-run");

// Helper: normalize ASN string to "as<number>".
// Returns "as39501" or null if cannot parse.
function normalizeAsn(raw) {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();

  if (/^as\d+$/i.test(s)) {
    return "as" + s.slice(2);
  }

  // If it's just digits, prefix "as"
  if (/^\d+$/.test(s)) {
    return "as" + s;
  }

  // Fallback: try to extract trailing digits
  const m = s.match(/(\d+)/);
  if (m) {
    return "as" + m[1];
  }

  return null;
}

// Helper: extract ASN from IODA guid
// Examples:
//   "geoasn-country-1762905000-geoasn/39501-US-ping-slash24"
//   "asn-country-1762637400-asn/25124-ping-slash24"
function extractAsnFromIodaGuid(guid) {
  if (!guid || typeof guid !== "string") return null;
  const slashIdx = guid.indexOf("/");
  if (slashIdx === -1) return null;
  const rest = guid.substring(slashIdx + 1); // e.g. "39501-US-ping-slash24"
  const dashIdx = rest.indexOf("-");
  const numStr = dashIdx === -1 ? rest : rest.substring(0, dashIdx);
  return normalizeAsn(numStr);
}

// Helper: extract ASN from Cloudflare URL
// Example:
//   "https://radar.cloudflare.com/as24631?dateStart="
function extractAsnFromCloudflareUrl(url) {
  if (!url || typeof url !== "string") return null;
  const marker = ".com/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let rest = url.substring(idx + marker.length); // e.g. "as24631?dateStart="
  const qIdx = rest.indexOf("?");
  if (qIdx !== -1) {
    rest = rest.substring(0, qIdx);
  }
  // rest should now look like "as24631" (or similar)
  return normalizeAsn(rest);
}

// Helper: turn ISO string into Date (or null).
function parseIsoDateOrNull(value) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Main backfill function
async function backfillReports() {
  // Filter: only docs where at least one of the target fields is missing

  // const filter = {
  //   $or: [
  //       { isOutageEvent: { $exists: false } },
  //       { isAsnScoped: { $exists: false } },
  //       { asn: { $exists: false } },
  //       { outageStartedAt: { $exists: false } },
  //       { outageEndedAt: { $exists: false } },
  //       { geoScope: { $exists: false } },
  //       ],
  // };

  const filter = {
    storedAt: { $lte: new Date("2025-07-01T00:00:00Z") },
    $or: [
      { isOutageEvent: { $exists: false } },
      { isAsnScoped: { $exists: false } },
      { asn: { $exists: false } },
      { outageStartedAt: { $exists: false } },
      { outageEndedAt: { $exists: false } },
      { geoScope: { $exists: false } },
    ],
  };

  const cursor = Report.find(filter).cursor();

  let batchOps = [];
  let batchInCount = 0;
  let batchOutCount = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;

  // For logging failures (parsing / unexpected) per batch
  let parseFailures = [];

  console.log(
    "[REPORT-BACKFILL] Starting backfill with filter:",
    JSON.stringify(filter),
  );
  if (DRY_RUN) console.log("[REPORT-BACKFILL][DRY-RUN] No writes will be made.");

  for await (const report of cursor) {
    batchInCount += 1;
    totalProcessed += 1;

    const update = {};

    const media0 = Array.isArray(report._media) ? report._media[0] : null;

    // --- 1. isOutageEvent: false for twitter, true otherwise ---
    if (typeof report.isOutageEvent === "undefined") {
      const isTwitter = media0 === "twitter";
      const isOutageEvent = !isTwitter;
      update.isOutageEvent = isOutageEvent;
    }

    // --- 2. isAsnScoped ---
    if (typeof report.isAsnScoped === "undefined") {
      let isAsnScoped = false;
      const raw = report?.metadata?.rawAPIResponse || {};
      if (media0 === "ioda") {
        const level = raw.entityLevel;
        isAsnScoped = !!level && level !== "Region";
      } else if (media0 === "cloudflare") {
        isAsnScoped = true;
      } else if (media0 === "twitter") {
        isAsnScoped = false;
      } else {
        isAsnScoped = false;
      }
      update.isAsnScoped = isAsnScoped;
    }

    const isOutageEventFinal =
      typeof update.isOutageEvent === "boolean"
        ? update.isOutageEvent
        : report.isOutageEvent;

    const isAsnScopedFinal =
      typeof update.isAsnScoped === "boolean"
        ? update.isAsnScoped
        : report.isAsnScoped;

    // --- 3. asn ---
    if (typeof report.asn === "undefined") {
      let newAsn = null;
      if (isAsnScopedFinal) {
        if (media0 === "ioda") {
          newAsn = extractAsnFromIodaGuid(report.guid);
          if (!newAsn) {
            parseFailures.push({
              _id: report._id.toString(),
              field: "asn",
              reason: "IODA guid parse failed",
              guid: report.guid,
            });
          }
        } else if (media0 === "cloudflare") {
          newAsn = extractAsnFromCloudflareUrl(report.url);
          if (!newAsn) {
            parseFailures.push({
              _id: report._id.toString(),
              field: "asn",
              reason: "Cloudflare URL parse failed",
              url: report.url,
            });
          }
        } else {
          parseFailures.push({
            _id: report._id.toString(),
            field: "asn",
            reason: "isAsnScoped true but media unknown",
            media0,
          });
        }
      }
      // If not ASN-scoped, newAsn stays null (explicitly indicating non-ASN)
      update.asn = newAsn;
    }

    const raw = report?.metadata?.rawAPIResponse || {};

    // --- 4. outageStartedAt ---
    if (typeof report.outageStartedAt === "undefined") {
      let newOutageStartedAt = null;
      if (typeof raw.started === "string") {
        newOutageStartedAt = parseIsoDateOrNull(raw.started);
        if (!newOutageStartedAt) {
          parseFailures.push({
            _id: report._id.toString(),
            field: "outageStartedAt",
            reason: "Invalid started date",
            value: raw.started,
          });
        }
      }
      update.outageStartedAt = newOutageStartedAt;
    }

    // --- 5. outageEndedAt ---
    if (typeof report.outageEndedAt === "undefined") {
      let newOutageEndedAt = null;
      if (typeof raw.ended === "string") {
        if (raw.ended !== "unknown") {
          newOutageEndedAt = parseIsoDateOrNull(raw.ended);
          if (!newOutageEndedAt) {
            parseFailures.push({
              _id: report._id.toString(),
              field: "outageEndedAt",
              reason: "Invalid ended date",
              value: raw.ended,
            });
          }
        } else {
          newOutageEndedAt = null;
        }
      }
      update.outageEndedAt = newOutageEndedAt;
    }

    // --- 6. geoScope ---
    if (typeof report.geoScope === "undefined") {
      let newGeoScope = null;

      const raw = report?.metadata?.rawAPIResponse || {};
      const level = raw.entityLevel;
      let entityScope = raw.entityScope;

      if (isOutageEventFinal) {
        // update entityscope field first
        if (
          (media0 === "ioda" || media0 === "cloudflare") &&
          (level === "AS" || level === "Country")
        ) {
          if (entityScope === "Iran") {
            entityScope = "Islamic Republic of Iran";
            update["metadata.rawAPIResponse.entityScope"] = entityScope;
          }
        }

        // Assign geoScope from (possibly normalized) entityScope
        newGeoScope =
          typeof entityScope === "string" && entityScope.trim() !== ""
            ? entityScope
            : null;

        if (!newGeoScope) {
          parseFailures.push({
            _id: report._id.toString(),
            field: "geoScope",
            reason: "Outage event with missing/empty entityScope",
            media0,
          });
        }
      } else {
        newGeoScope = null;
      }

      update.geoScope = newGeoScope;
    }

    if (Object.keys(update).length > 0) {
      batchOps.push({
        updateOne: {
          filter: { _id: report._id },
          update: { $set: update },
        },
      });
      batchOutCount += 1;
      totalUpdated += 1;
    }

    // Flush batch if large enough
    if (batchOps.length >= BATCH_SIZE) {
      await flushBatch(batchOps, batchInCount, batchOutCount, parseFailures);
      batchOps = [];
      batchInCount = 0;
      batchOutCount = 0;
      parseFailures = [];
    }

    if (totalProcessed % 10000 === 0) {
      console.log(
        `[REPORT-BACKFILL] Processed ${totalProcessed} reports so far...`,
      );
    }
  }

  // Flush last partial batch
  if (batchOps.length > 0) {
    await flushBatch(batchOps, batchInCount, batchOutCount, parseFailures);
  }

  console.log(
    DRY_RUN
      ? `[REPORT-BACKFILL][DRY-RUN] Done. Total processed=${totalProcessed}, would update=${totalUpdated} (no writes made)`
      : `[REPORT-BACKFILL] Done. Total processed=${totalProcessed}, total updated=${totalUpdated}`,
  );
}

async function flushBatch(batchOps, inCount, outCount, failures) {
  console.log(
    `[REPORT-BACKFILL] Flushing batch: in=${inCount}, toUpdate=${outCount}, parseFailures=${failures.length}`,
  );

  if (failures.length > 0) {
    console.log("[REPORT-BACKFILL] Parse / derivation failures in this batch:");
    failures.forEach((f) => {
      console.log(
        `  - _id=${f._id}, field=${f.field}, reason=${f.reason}, extra=${JSON.stringify(
          { guid: f.guid, url: f.url, value: f.value, media0: f.media0 },
        )}`,
      );
    });
  }

  if (batchOps.length === 0) return;

  if (DRY_RUN) {
    console.log(
      `[REPORT-BACKFILL][DRY-RUN] Would bulkWrite ${batchOps.length} update(s). Skipping.`,
    );
    return;
  }

  try {
    const res = await Report.bulkWrite(batchOps, { ordered: false });
    console.log(
      `[REPORT-BACKFILL] bulkWrite result: matched=${res.matchedCount}, modified=${res.modifiedCount}`,
    );
  } catch (err) {
    console.error("[REPORT-BACKFILL] bulkWrite error:", err);
  }
}

async function main() {
  try {
    await backfillReports();
  } catch (err) {
    console.error("[REPORT-BACKFILL] Fatal error:", err);
  } finally {
    if (mongoose && mongoose.connection) {
      await mongoose.connection.close();
    }
  }
}

if (require.main === module) {
  main();
}
