'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function runSeed(existing, apply) {
  const writes = [];
  const logs = [];
  let finished;
  const done = new Promise((resolve) => { finished = resolve; });
  const process = { argv: apply ? ['--apply'] : [] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'seed-standard-tags.js'), 'utf8'), {
    process,
    console: { log: (line) => logs.push(line), error: (error) => { throw error; } },
    require: (name) => {
      if (name === 'dotenv') return { config() {} };
      if (name === '../database') return { mongoose: { connection: {
        readyState: 1, close: async () => finished(),
      } } };
      if (name === '../models/tag') return {
        find: () => ({ select: () => ({ lean: async () => existing }) }),
        create: async (tags) => writes.push(...tags),
      };
      throw new Error(name);
    },
  });
  await done;
  assert.equal(process.exitCode, undefined);
  return { writes, logs };
}

test('seed previews additions without writing', async () => {
  const { writes, logs } = await runSeed([], false);
  assert.equal(writes.length, 0);
  assert.ok(logs.includes('46 standard tag(s) will be added.'));
});

test('seed preserves existing names and categories and is repeatable', async () => {
  const existing = [
    { name: ' dns ', category: 'protocol_affected' },
    { name: 'https', category: 'special' },
    { name: 'TEHRAN', category: 'special' },
  ];
  const { writes } = await runSeed(existing, true);
  assert.equal(writes.length, 43);
  const names = writes.map((tag) => tag.name.toLowerCase());
  assert.ok(!names.includes('dns') && !names.includes('https') && !names.includes('tehran'));
  assert.equal(new Set(names).size, writes.length);
  assert.equal(writes.find((tag) => tag.name === 'Anycast').category, 'network_type');
  assert.equal(writes.find((tag) => tag.name === 'Multi Probe').category, 'measurement_method');
  assert.equal((await runSeed([...existing, ...writes], true)).writes.length, 0);
});
