// One-time (or occasionally rerunnable) backfill script for Report fields:
//  - metadata.rawAPIResponse.entityLevel
//
//  For backfilling historical data ingested from ioda geoasn-country source with entityLevel updated
//  original: AS
//  updated: AS - Country

require("dotenv").config();
const database = require("../database");
const mongoose = database.mongoose;
const Report = require("../models/report");

async function run() {
  try {
    const filter = {
      "_media.0": "ioda",
      guid: { $regex: /^geoasn-country/ },
      "metadata.rawAPIResponse.entityLevel": { $ne: "AS - Country" },
    };

    const update = {
      $set: {
        "metadata.rawAPIResponse.entityLevel": "AS - Country",
      },
    };

    const count = await Report.countDocuments(filter);
    console.log(`Documents needing update: ${count}`);

    if (count === 0) {
      console.log("No documents need updating.");
      return;
    }

    const result = await Report.updateMany(filter, update);

    const matched = result.matchedCount ?? result.n ?? result.result?.n;

    const modified =
      result.modifiedCount ?? result.nModified ?? result.result?.nModified;

    console.log("Backfill finished.");
    console.log(`Matched: ${matched}`);
    console.log(`Modified: ${modified}`);
  } catch (err) {
    console.error("Backfill failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
