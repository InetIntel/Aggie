// Alternative to `mongoimport` for environments where it's not installed and
// there's no way to install it (no sudo). Uses the same MongoDB driver this
// repo already depends on (via Mongoose) to insert the generated OONI alert
// file directly - no external tool needed, just `node`.
//
// Reads DATABASE_URL from this environment's own .env, same as the running
// app - so on a real deployment (Aggie Dev/Production), run this directly on
// that server and it targets that server's own database automatically, no
// connection string needs to be typed or shared anywhere.
//
// Usage:
//   node scripts/backfill/import-ooni-alerts-jsonl.js [path-to-jsonl]
// Defaults to data/ooni-alerts-backfill.jsonl if no path given.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const database = require('../../backend/database');
const mongoose = database.mongoose;
const Report = require('../../backend/models/report');

const FILE = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'ooni-alerts-backfill.jsonl');

// Reverses the MongoDB Extended JSON ($date / $oid) the generator writes,
// back into real Date/ObjectId instances - same job mongoimport does.
function fromExtendedJson(value) {
  if (Array.isArray(value)) return value.map(fromExtendedJson);
  if (value && typeof value === 'object') {
    if (typeof value.$date === 'string') return new Date(value.$date);
    if (typeof value.$oid === 'string') return new mongoose.Types.ObjectId(value.$oid);
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = fromExtendedJson(val);
    return out;
  }
  return value;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    throw new Error(`File not found: ${FILE}`);
  }

  const lines = fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean);
  const docs = lines.map((line) => fromExtendedJson(JSON.parse(line)));
  console.log(`Read ${docs.length} document(s) from ${FILE}`);

  try {
    const result = await Report.collection.insertMany(docs, { ordered: false });
    console.log(`Inserted: ${result.insertedCount}, skipped (none - all new): 0`);
  } catch (err) {
    // Duplicate guids (e.g. alerts that already exist from the live channel)
    // fail individually in unordered mode; everything else still inserts.
    if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
      const insertedCount = err.result?.insertedCount ?? err.insertedCount ?? 0;
      const failedCount = docs.length - insertedCount;
      console.log(`Inserted: ${insertedCount}, skipped (already existed / duplicate guid): ${failedCount}`);
    } else {
      throw err;
    }
  }
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Import failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
