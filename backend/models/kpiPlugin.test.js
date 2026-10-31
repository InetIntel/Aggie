const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { kpiPlugin } = require('./kpiPlugin');

function fixture(entity) {
  const instance = new mongoose.Mongoose();
  const schema = new instance.Schema({ _group: mongoose.Schema.Types.ObjectId, irrelevant: String, isOutageEvent: Boolean, title: String });
  const events = [];
  schema.plugin(kpiPlugin, { entity, recordEvents: async (items) => events.push(...items) });
  const Model = instance.model('Fixture', schema);
  Model.collection.insertOne = (doc, options, cb) => cb(null, { result: { ok: 1, n: 1 } });
  Model.collection.updateOne = (query, update, options, cb) => cb(null, { result: { ok: 1, n: 1, nModified: 1 } });
  Model.collection.findOne = (query, options, cb) => cb(null, { _id: query._id });
  return { Model, events };
}

test('new accounts and incidents are recorded once, only after successful saves', async () => {
  for (const [entity, kind] of [['user', 'signup'], ['group', 'incident_created']]) {
    const { Model, events } = fixture(entity);
    const doc = new Model({ title: 'new' });
    await doc.save();
    doc.title = 'changed';
    await doc.save();
    assert.deepEqual(events.map((event) => event.kind), [kind]);
    const failed = new Model();
    Model.collection.insertOne = (doc, options, cb) => cb(new Error('write failed'));
    await assert.rejects(failed.save(), /write failed/);
    assert.equal(events.length, 1);
  }
});

test('triage records actual changes but excludes ingestion, repeated values and unlinking', async () => {
  for (const isOutageEvent of [true, false]) {
    const { Model, events } = fixture('report');
    const doc = new Model({ isOutageEvent, irrelevant: 'maybe' });
    await doc.save();
    assert.equal(events.length, 0);
    const group = new mongoose.Types.ObjectId();
    doc._group = group;
    doc.irrelevant = 'false';
    await doc.save();
    doc._group = group;
    doc.irrelevant = 'false';
    await doc.save();
    assert.deepEqual(events.map((event) => event.kind), ['assigned', 'investigate']);
    doc._group = undefined;
    doc.irrelevant = 'true';
    await doc.save();
    doc.irrelevant = 'maybe';
    await doc.save();
    assert.deepEqual(events.map((event) => event.kind), ['assigned', 'investigate', 'ignore']);
    assert.ok(events.every((event) => event.category === (isOutageEvent ? 'alerts' : 'social')));
  }
});
