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
  { name: 'Inbound', category: 'direction' },
  { name: 'Outbound', category: 'direction' },
  { name: 'Domestic to Domestic Measurement', category: 'direction' },
  { name: 'Mobile operator', category: 'network_type' },
  { name: 'Datacenter', category: 'network_type' },
  { name: 'Domestic platforms', category: 'network_type' },
  { name: 'Fintech', category: 'network_type' },
  { name: 'Office', category: 'network_type' },
  { name: 'Infrastructure', category: 'network_type' },
  { name: 'International Gateway', category: 'network_type' },
  { name: 'Anycast', category: 'network_type' },
  { name: 'Fiber', category: 'connection_technology' },
  { name: 'LTE', category: 'connection_technology' },
  { name: 'ADSL', category: 'connection_technology' },
  { name: 'Tehran', category: 'location' },
  { name: 'Karaj', category: 'location' },
  { name: 'Tabriz', category: 'location' },
  { name: 'Other location', category: 'location' },
  { name: 'Passive', category: 'measurement_method' },
  { name: 'HTTPS', category: 'measurement_method' },
  { name: 'API', category: 'measurement_method' },
  { name: 'Mobile app', category: 'measurement_method' },
  { name: 'ICMP', category: 'measurement_method' },
  { name: 'Multi Probe', category: 'measurement_method' },
  { name: 'Streaming', category: 'service_type' },
  { name: 'Download service', category: 'service_type' },
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

  // Match names regardless of case or surrounding whitespace; preserve existing tags.
  const normalizeName = (name) => name.trim().toLowerCase();
  const existing = await SMTCTag.find({}).select('name').lean();
  const existingNames = new Set(existing.map((tag) => normalizeName(tag.name)));
  const missing = STANDARD_TAGS.filter((tag) => {
    const name = normalizeName(tag.name);
    if (existingNames.has(name)) return false;
    existingNames.add(name);
    return true;
  });

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
