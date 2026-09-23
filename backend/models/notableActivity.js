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
  // Under `startTime` this is the '*' sentinel: such activities span many keys, listed in
  // eventAggKeyBases, because grouping is on outage start alone.
  eventAggKeyBase: { type: String, required: true, index: true },
  eventAggKeyBases: { type: [String], default: [] },
  bucketStart: { type: Date, required: true, index: true },
  bucketEnd: { type: Date, required: true, index: true },
  bucketSizeMinutes: { type: Number, required: true, index: true },

  // Which grouping produced this snapshot — 'bucket' (fixed grid) or 'startTime'
  // (clustered outage starts). Part of cacheKey too, so the two never mix in one result set.
  aggregationMethod: { type: String, default: 'bucket', index: true },
  startTimeToleranceMinutes: { type: Number },

  sourceCnt: { type: Number, required: true, default: 0 },
  sources: { type: [String], default: [] },
  signalCnt: { type: Number, required: true, default: 0 },
  signals: { type: [String], default: [] },
  totalReports: { type: Number, required: true, default: 0 },
  reportIds: {
    type: [{ type: SchemaTypes.ObjectId, ref: 'Report' }],
    default: [],
  },
  // Report counts per bucket of each report's own outageStartedAt. Differs from
  // bucketStart/totalReports only when OONI reports were merged in from another bucket.
  reportBuckets: {
    type: [{
      _id: false,
      bucketStart: { type: Date, required: true },
      totalReports: { type: Number, required: true },
      // { <media>: count }, summing to totalReports — the chart's per-source lines.
      sourceCounts: { type: SchemaTypes.Mixed, default: {} },
    }],
    default: [],
  },
  isHighConfidence: { type: Boolean, required: true, default: false, index: true },

  asn: { type: String },
  geoScope: { type: String },
  // Full lists behind the single-valued asn/geoScope above, which are only set when the
  // activity covers exactly one. `locations` holds "asn / region" labels, paired per report.
  asns: { type: [String], default: [] },
  locations: { type: [String], default: [] },

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
