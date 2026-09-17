// One-time backfill: regenerate the stored `content` field on existing OONI
// reports using the current alertContent() text (no domain names, no raw
// timestamp - see backend/fetching/channels/ooni.js). Reports created before
// that change still have the old text baked in; this brings them in line
// without touching anything else on the document.

require("dotenv").config();
const database = require("../../backend/database");
const mongoose = database.mongoose;
const Report = require("../../backend/models/report");
const OONIChannel = require("../../backend/fetching/channels/ooni");

// Pass --dry-run to report what would change without writing.
const DRY_RUN = process.argv.slice(2).includes("--dry-run");

async function run() {
  try {
    if (DRY_RUN) console.log("[DRY-RUN] No writes will be made.");

    const reports = await Report.find({ _media: "ooni" });
    console.log(`OONI reports found: ${reports.length}`);

    let changed = 0;
    let skipped = 0;
    const writes = [];

    for (const report of reports) {
      const raw = report.metadata?.rawAPIResponse;
      const triggers = raw?.triggers;
      if (!raw?.probeASN || !Array.isArray(triggers) || triggers.length === 0) {
        console.warn(`Skipping ${report.guid} - missing probeASN/triggers.`);
        skipped += 1;
        continue;
      }

      const newContent = OONIChannel.alertContent(raw.probeASN, triggers);
      if (newContent === report.content) continue;

      changed += 1;
      console.log(`${report.guid}\n  old: ${report.content}\n  new: ${newContent}`);
      writes.push({
        updateOne: {
          filter: { _id: report._id },
          update: { $set: { content: newContent } },
        },
      });
    }

    console.log(`\nWould update: ${changed}, unchanged: ${reports.length - changed - skipped}, skipped: ${skipped}`);

    if (DRY_RUN || writes.length === 0) {
      if (!DRY_RUN) console.log("Nothing to update.");
      return;
    }

    const result = await Report.bulkWrite(writes);
    console.log(`Backfill finished. Modified: ${result.modifiedCount}`);
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
