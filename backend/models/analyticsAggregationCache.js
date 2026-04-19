'use strict';
// data model for storing cacheKey, if cache hit, fetch snapshot from notableActivity model, otherwise compute aggregation result

const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;

const analyticsAggregationCacheSchema = new Schema({
  cacheKey: { type: String, required: true, unique: true, index: true },
  rangePreset: { type: String, required: true, index: true },
  rangeStart: { type: Date, required: true, index: true },
  rangeEnd: { type: Date, required: true, index: true },
  bucketSizeMinutes: { type: Number, required: true, index: true },
  filters: { type: Schema.Types.Mixed, default: {} },
  resultCount: { type: Number, required: true, default: 0 },
  computedAt: { type: Date, required: true, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
});

analyticsAggregationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AnalyticsAggregationCache = mongoose.model(
  'AnalyticsAggregationCache',
  analyticsAggregationCacheSchema
);

module.exports = AnalyticsAggregationCache;
