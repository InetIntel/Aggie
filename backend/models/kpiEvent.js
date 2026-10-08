'use strict';

const { randomUUID } = require('crypto');
const { mongoose } = require('../database');

// Deliberately independent of source records: deleting an account or incident
// must not rewrite previously reported activity. No names or content are stored.
const schema = new mongoose.Schema({
  _id: { type: String, default: randomUUID },
  kind: { type: String, required: true, enum: [
    'tracking_started', 'signup', 'login', 'incident_created',
    'assigned', 'investigate', 'ignore',
  ] },
  at: { type: Date, default: Date.now, required: true },
  subject: String,
  category: { type: String, enum: ['alerts', 'social'] },
});
schema.index({ at: 1, kind: 1 });
module.exports = mongoose.model('KpiEvent', schema);
