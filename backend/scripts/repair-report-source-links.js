'use strict';

const { MongoClient, ObjectID } = require('mongoose').mongo;

const BACKUP_COLLECTION = 'issue271_source_link_backups';
const REPAIRS = [
  {
    name: 'OONI backfill',
    media: 'ooni',
    sourceId: '6aa95add10ae208bc33e09b4',
    maximum: 525,
    filter: {
      _media: ['ooni'],
      _sources: [],
      asn: { $in: ['as44244', 'as58224'] },
      guid: /^ooni:(44244|58224):domains:\d{4}-\d{2}-\d{2}$/,
      authoredAt: {
        $gte: new Date('2025-12-01T00:00:00Z'),
        $lt: new Date('2026-09-15T00:00:00Z'),
      },
    },
  },
  {
    name: 'Mastodon Tehran search',
    media: 'mastodon',
    sourceId: '6a68ed9f0c4efe06969429a5',
    oldSourceId: '6ab2a1129ca161a84013eb46',
    maximum: 67,
    filter: {
      _media: ['mastodon'],
      _sources: ['6ab2a1129ca161a84013eb46'],
      'metadata.rawAPIResponse.serverUrl': 'https://mastodon.social',
      'metadata.rawAPIResponse.mode': 'keyword',
      'metadata.rawAPIResponse.modeValue': 'Tehran',
      authoredAt: {
        $gte: new Date('2026-09-22T00:00:00Z'),
        $lt: new Date('2026-09-24T00:00:00Z'),
      },
    },
  },
];

async function repairSourceLinks(db, apply = false, logger = console, ooniSourceId) {
  const sources = db.collection('sources');
  const reports = db.collection('reports');
  const counts = {};

  for (const repair of REPAIRS) {
    const sourceId = repair.media === 'ooni' ? ooniSourceId || repair.sourceId : repair.sourceId;
    const source = await sources.findOne({ _id: new ObjectID(sourceId) });
    if (!source) {
      logger.log(`${repair.name}: destination feed not found, skipped.`);
      continue;
    }
    const pending = await reports.find(repair.filter, {
      projection: { _id: 1, _sources: 1 },
    }).limit(repair.maximum + 1).toArray();
    counts[repair.name] = 0;
    if (pending.length === 0) {
      logger.log(`${repair.name}: no reports to update.`);
      continue;
    }

    const countries = source.countryCodes || [];
    if (source.media !== repair.media ||
        source.accessPolicy?.mode !== 'country_restricted' ||
        countries.length !== 1 || countries[0] !== 'IR') {
      throw new Error(`${repair.name}: destination must be an Iran-only, country-restricted ${repair.media} feed.`);
    }
    if (pending.length > repair.maximum) {
      throw new Error(`${repair.name}: more than ${repair.maximum} reports matched.`);
    }
    if (repair.oldSourceId && await sources.findOne({ _id: new ObjectID(repair.oldSourceId) })) {
      throw new Error(`${repair.name}: original feed exists again.`);
    }

    logger.log(`${repair.name}: ${pending.length} reports -> ${sourceId}`);
    if (!apply) {
      counts[repair.name] = pending.length;
      continue;
    }
    const backups = db.collection(BACKUP_COLLECTION);
    await backups.bulkWrite(pending.map((report) => ({ updateOne: {
      filter: { _id: report._id },
      update: { $setOnInsert: {
        sources: report._sources,
        targetSourceId: sourceId,
        backedUpAt: new Date(),
      } },
      upsert: true,
    } })));
    const saved = await backups.find({ _id: { $in: pending.map((r) => r._id) } }).toArray();
    const byId = new Map(saved.map((record) => [String(record._id), record]));
    for (const report of pending) {
      const backup = byId.get(String(report._id));
      if (!backup || backup.targetSourceId !== sourceId ||
          JSON.stringify(backup.sources) !== JSON.stringify(report._sources)) {
        throw new Error(`${repair.name}: source-link backup could not be verified.`);
      }
    }

    const result = await reports.updateMany(
      { ...repair.filter, _id: { $in: pending.map((report) => report._id) } },
      { $set: { _sources: [sourceId] } },
    );
    const modified = result.modifiedCount ?? result.nModified ?? 0;
    counts[repair.name] = modified;
    if (modified !== pending.length) {
      throw new Error(`${repair.name}: expected ${pending.length} updates, received ${modified}.`);
    }
    logger.log(`${repair.name}: updated ${modified}. Backup: ${BACKUP_COLLECTION}`);
  }
  return counts;
}

async function run(apply = false, ooniSourceId) {
  if (ooniSourceId !== undefined) {
    if (!/^[a-f\d]{24}$/i.test(ooniSourceId)) throw new Error('Invalid OONI source ID.');
    ooniSourceId = ooniSourceId.toLowerCase();
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const client = new MongoClient(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
  });
  try {
    await client.connect();
    const counts = await repairSourceLinks(client.db(process.env.DATABASE_NAME || 'aggie'), apply, console, ooniSourceId);
    if (!apply) console.log('Preview only. Run with --apply to update the reports.');
    return counts;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  require('dotenv').config();
  const sourceArg = process.argv.find((arg) => arg.startsWith('--ooni-source-id='));
  run(process.argv.includes('--apply'), sourceArg?.slice('--ooni-source-id='.length)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { repairSourceLinks, run, REPAIRS, BACKUP_COLLECTION };
