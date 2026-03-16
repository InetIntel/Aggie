// ASN metadata for past 7 days fetch
// unique identifier as (asn, fetchDate)

'use strict';

const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;

/**
 * AsnDailyStats
 *
 * Time-series snapshots for ASN-level daily metrics.
 */
const AsnDailyStatsSchema = new Schema({
  asn: { type: String, required: true, index: true,},
  snapshotDate: { type: Date, required: true, index: true,},
  number: { type: Number, required: true, index: true,},// Numeric ASN, e.g. 1350
  name: { type: String, index: true,},
  country: { type: String, index: true,},  // Optional ISO country code
  source: { type: String,},
  raw: { type: Schema.Types.Mixed },
  populationCoverageTotal: { type: Number, default: null },
  populationCoverageDirect: { type: Number, default: null },
  populationCoverageIndirect: { type: Number, default: null },
  asCoverageTotal: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now,},
  updatedAt: { type: Date, default: Date.now,},
});


AsnDailyStatsSchema.index({ asn: 1, snapshotDate: 1 }, { unique: true });

AsnDailyStatsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (!this.createdAt) {
    this.createdAt = this.updatedAt;
  }
  next();
});

/**
 * Upsert helper for a daily snapshot.
 */
AsnDailyStatsSchema.statics.upsertDailyStats = async function (data) {
    const AsnDailyStats = this;
    const {
      asn,
      snapshotDate,
      number,
      name,
      country,
      source,
      raw,
      populationCoverageTotal,
      populationCoverageDirect,
      populationCoverageIndirect,
      asCoverageTotal,
    } = data;
  
    if (!asn || !(snapshotDate instanceof Date)) {
      throw new Error(
        'AsnDailyStats.upsertDailyStats: asn (string) and snapshotDate (Date) are required'
      );
    }
  
    if (typeof number !== 'number') {
      throw new Error(
        'AsnDailyStats.upsertDailyStats: number (numeric ASN) is required'
      );
    }
  
    const now = new Date();
  
    await AsnDailyStats.updateOne(
      { asn, snapshotDate },
      {
        $set: {
          asn,
          snapshotDate,
          number,
          name: name || null,
          country: country || null,
          source: source || null,
          raw,
          populationCoverageTotal: populationCoverageTotal || null,
          populationCoverageDirect: populationCoverageDirect || null,
          populationCoverageIndirect: populationCoverageIndirect || null,
          asCoverageTotal: asCoverageTotal || null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );
  };

/**
 * Helper: get latest snapshot for an ASN
 */
AsnDailyStatsSchema.statics.findLatestForAsn = async function (asn) {
  const AsnDailyStats = this;
  if (!asn) return null;
  return AsnDailyStats.findOne({ asn }).sort({ snapshotDate: -1 }).lean().exec();
};

/**
 * Helper: get last N daily snapshots for an ASN
 */
AsnDailyStatsSchema.statics.findRecentForAsn = async function (asn, days) {
  const AsnDailyStats = this;
  if (!asn || !days || days <= 0) return [];

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  return AsnDailyStats.find({
    asn,
    snapshotDate: { $gte: cutoff },
  })
    .sort({ snapshotDate: -1 })
    .lean()
    .exec();
};

const AsnDailyStats = mongoose.model('AsnDailyStats', AsnDailyStatsSchema);

module.exports = AsnDailyStats;