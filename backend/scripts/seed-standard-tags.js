'use strict';

require('dotenv').config();

const database = require('../database');
const SMTCTag = require('../models/tag');

const STANDARD_TAGS = [
  { name: 'BGP Measurement', category: 'measurement' },
  { name: 'Active Probing', category: 'measurement' },
  { name: 'Telescope', category: 'measurement' },
  { name: 'DNS Measurement', category: 'measurement' },
  { name: 'Traffic', category: 'measurement' },
  { name: 'Web Connectivity Test', category: 'measurement' },
  { name: 'DNS', category: 'protocol_affected' },
  { name: 'BGP', category: 'protocol_affected' },
  { name: 'TCP', category: 'protocol_affected' },
  { name: 'HTTP', category: 'protocol_affected' },
  { name: 'Government Directed', category: 'cause' },
  { name: 'Kinetic Conflict', category: 'cause' },
  { name: 'Cyber Attack', category: 'cause' },
  { name: 'Cable Cut', category: 'cause' },
  { name: 'DDoS', category: 'cause' },
  { name: 'Weather', category: 'cause' },
  { name: 'Power Outage', category: 'cause' },
  { name: 'Maintenance', category: 'cause' },
  { name: 'VPN', category: 'circumvention_solution' },
  { name: 'Alternate DNS', category: 'circumvention_solution' },
];

const waitForDatabase = async () => {
  if (database.mongoose.connection.readyState === 1) return;

  await new Promise((resolve, reject) => {
    database.mongoose.connection.once('open', resolve);
    database.mongoose.connection.once('error', reject);
  });
};

const main = async () => {
  await waitForDatabase();

  const existing = await SMTCTag.find({
    name: { $in: STANDARD_TAGS.map((tag) => tag.name) },
  }).select('name').lean();
  const existingNames = new Set(existing.map((tag) => tag.name));
  const missing = STANDARD_TAGS.filter((tag) => !existingNames.has(tag.name));

  console.log(`${missing.length} standard tag(s) will be added.`);
  missing.forEach((tag) => console.log(`${tag.category}: ${tag.name}`));

  if (!process.argv.includes('--apply')) {
    console.log('Dry run only. Re-run with --apply to add these tags.');
    return;
  }

  if (missing.length) {
    await SMTCTag.create(
      missing.map((tag) => ({
        ...tag,
        color: '#ffffff',
        description: '',
        isCommentTag: false,
      }))
    );
  }

  console.log('Standard tags added successfully.');
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.mongoose.connection.close();
  });
