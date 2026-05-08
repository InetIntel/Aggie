'use strict';
// data model for materialized snapshot of aggregated reports by eventAggKey

const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;
const SchemaTypes = mongoose.SchemaTypes;

const notableActivitySchema = new Schema({
  cacheKey: { type: String, required: true, index: true },
  rangePreset: { type: String, required: true, index: true },
  rangeStart: { type: Date, required: true, index: true },
  rangeEnd: { type: Date, required: true, index: true },

  eventAggKey: { type: String, required: true, index: true },
  eventAggKeyBase: { type: String, required: true, index: true },
  bucketStart: { type: Date, required: true, index: true },
  bucketEnd: { type: Date, required: true, index: true },
  bucketSizeMinutes: { type: Number, required: true, index: true },

  sourceCnt: { type: Number, required: true, default: 0 },
  sources: { type: [String], default: [] },
  signalCnt: { type: Number, required: true, default: 0 },
  signals: { type: [String], default: [] },
  totalReports: { type: Number, required: true, default: 0 },
  reportIds: {
    type: [{ type: SchemaTypes.ObjectId, ref: 'Report' }],
    default: [],
  },
  isHighConfidence: { type: Boolean, required: true, default: false, index: true },

  asn: { type: String },
  geoScope: { type: String },

  incidentId: { type: SchemaTypes.ObjectId, ref: 'Group', default: null, index: true },

  computedAt: { type: Date, required: true, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
});

notableActivitySchema.index(
  {
    cacheKey: 1,
    eventAggKey: 1,
  },
  { unique: true }
);
notableActivitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const NotableActivity = mongoose.model('NotableActivity', notableActivitySchema);

module.exports = NotableActivity;
