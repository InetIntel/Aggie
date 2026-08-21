require("dotenv").config();

const database = require("../database");
const mongoose = database.mongoose;
const Report = require("../models/report");
const {
  buildEventAggKeyBase,
  buildEventIdentifier,
} = require("../fetching/utils/iodaUtils");

const BATCH_SIZE = 500;

async function run() {
  try {
    const filter = {
      "_media.0": { $in: ["ioda", "cloudflare"] },
    };

    const total = await Report.countDocuments(filter);
    console.log(`Documents needing key backfill: ${total}`);

    if (total === 0) {
      console.log("No documents need updating.");
      return;
    }

    const cursor = Report.find(filter)
      .select({
        _id: 1,
        asn: 1,
        geoScope: 1,
        outageStartedAt: 1,
        _media: 1,
      })
      .lean()
      .cursor();

    let ops = [];
    let scanned = 0;
    let prepared = 0;
    let matchedTotal = 0;
    let modifiedTotal = 0;

    for await (const report of cursor) {
      scanned += 1;

      const eventAggKeyBase = buildEventAggKeyBase({
        asn: report.asn,
        geoScope: report.geoScope,
      });

      const eventIdentifier = buildEventIdentifier({
        asn: report.asn,
        geoScope: report.geoScope,
        outageStartedAt: report.outageStartedAt,
      });

      ops.push({
        updateOne: {
          filter: { _id: report._id },
          update: {
            $set: {
              eventAggKeyBase,
              eventIdentifier,
            },
          },
        },
      });
      prepared += 1;

      if (ops.length >= BATCH_SIZE) {
        const result = await Report.bulkWrite(ops);

        const matched =
          result.matchedCount ??
          result.nMatched ??
          result.result?.nMatched ??
          result.n ??
          result.result?.n ??
          0;

        const modified =
          result.modifiedCount ??
          result.nModified ??
          result.result?.nModified ??
          0;

        matchedTotal += matched;
        modifiedTotal += modified;

        console.log(
          `Progress: scanned=${scanned}, prepared=${prepared}, matched=${matchedTotal}, modified=${modifiedTotal}`,
        );

        ops = [];
      }
    }

    if (ops.length > 0) {
      const result = await Report.bulkWrite(ops);

      const matched =
        result.matchedCount ??
        result.nMatched ??
        result.result?.nMatched ??
        result.n ??
        result.result?.n ??
        0;

      const modified =
        result.modifiedCount ??
        result.nModified ??
        result.result?.nModified ??
        0;

      matchedTotal += matched;
      modifiedTotal += modified;
    }

    console.log("Backfill finished.");
    console.log(`Scanned: ${scanned}`);
    console.log(`Prepared updates: ${prepared}`);
    console.log(`Matched: ${matchedTotal}`);
    console.log(`Modified: ${modifiedTotal}`);
  } catch (err) {
    console.error("Backfill failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
