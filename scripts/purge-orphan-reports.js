// One-off cleanup: free space on an over-quota cluster by deleting stale, ungrouped reports.
//
// Reports have no TTL, so the collection grows forever (IODA/Cloudflare poll every ~5 min
// and write a report per outage). This purges reports that are BOTH orphaned (not linked to
// any incident/group) AND older than the cutoff — keeping every grouped report plus the last
// N days of everything. Deleting orphaned reports is safe: groups reference reports, not the
// reverse, and a group only recomputes its counter on save.
//
// Dry-run by default (reports counts + collection size, writes nothing). Pass --apply to delete.
//   node scripts/purge-orphan-reports.js            # dry run
//   node scripts/purge-orphan-reports.js --apply    # actually delete
//
// To purge ALL orphans regardless of age, set CUTOFF_DAYS to null below.

process.title = 'aggie-purge-orphan-reports';

const database = require('../backend/database');
const Report = require('../backend/models/report');
require('dotenv').config();

// Keep the last N days of reports. Set to null to ignore age and purge every orphan.
const CUTOFF_DAYS = 30;

const APPLY = process.argv.includes('--apply');

function buildFilter() {
  // { _group: null } matches both explicit null and missing/unset in MongoDB.
  const filter = { _group: null };
  if (CUTOFF_DAYS != null) {
    const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000);
    filter.storedAt = { $lt: cutoff };
  }
  return filter;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function collStats() {
  // Raw driver stats() so we can see storage/index size before and after.
  return Report.collection.stats();
}

async function purge() {
  const filter = buildFilter();
  console.log(`Mode: ${APPLY ? 'APPLY (deleting)' : 'DRY RUN (no writes)'}`);
  console.log(`Cutoff: ${CUTOFF_DAYS == null ? 'none (all orphans)' : `${CUTOFF_DAYS} days`}`);
  console.log('Filter:', JSON.stringify(filter));

  const before = await collStats();
  const total = await Report.collection.countDocuments({});
  const toDelete = await Report.collection.countDocuments(filter);
  const grouped = await Report.collection.countDocuments({ _group: { $ne: null } });

  console.log('\n--- Before ---');
  console.log(`total reports:     ${total}`);
  console.log(`linked to a group: ${grouped} (kept)`);
  console.log(`matching filter:   ${toDelete} (${total ? ((toDelete / total) * 100).toFixed(1) : 0}% of total)`);
  console.log(`storageSize:       ${mb(before.storageSize)}`);
  console.log(`totalIndexSize:    ${mb(before.totalIndexSize)}`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to delete the matching reports.');
    return;
  }

  console.log(`\nDeleting ${toDelete} reports...`);
  const res = await Report.collection.deleteMany(filter);
  console.log(`deletedCount: ${res.deletedCount}`);

  const after = await collStats();
  console.log('\n--- After ---');
  console.log(`storageSize:    ${mb(after.storageSize)} (was ${mb(before.storageSize)})`);
  console.log(`totalIndexSize: ${mb(after.totalIndexSize)} (was ${mb(before.totalIndexSize)})`);
  console.log(`remaining reports: ${await Report.collection.countDocuments({})}`);
}

database.mongoose.connection.once('open', async () => {
  try {
    await purge();
    process.exit(0);
  } catch (err) {
    console.error('Purge aborted:', err);
    process.exit(1);
  }
});
