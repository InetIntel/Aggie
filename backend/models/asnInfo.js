// metadata for mapping ASN to AS Name
// unique identifier as (asn)
// one ASN per entry, keeping ASN mapping relationship from latest fetch only
'use strict';

const database = require('../database');
const mongoose = database.mongoose;
const Schema = mongoose.Schema;

let AsnInfoSchema = new Schema({
  asn: { type: String, required: true, unique: true, index: true,},
  number: { type: Number, required: true, index: true,},// Numeric ASN, e.g. 1350
  name: { type: String, index: true,},
  country: { type: String, index: true,},  // Optional ISO country code
  source: { type: String,},
  raw: { type: Schema.Types.Mixed },
  populationCoverageTotal: { type: Number, default: null },
  populationCoverageDirect: { type: Number, default: null },
  populationCoverageIndirect: { type: Number, default: null },
  asCoverageTotal: { type: Number, default: null },
  firstSeenAt: { type: Date, default: Date.now,},
  lastUpdatedAt: { type: Date, default: Date.now,},
});

// Text index for name/org search in UI
AsnInfoSchema.index({ name: 'text'});

AsnInfoSchema.pre('save', function (next) {
  this.lastUpdatedAt = new Date();
  if (!this.firstSeenAt) {
    this.firstSeenAt = this.lastUpdatedAt;
  }
  next();
});

/**
 * Upsert helper for ingestion.
 */
AsnInfoSchema.statics.upsertFromIngestion = async function (data) {
  const AsnInfo = this;


  const {
    asn,
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


  if (!asn || typeof number !== 'number') {
    throw new Error('AsnInfo.upsertFromIngestion: asn (string) and number (number) are required');
  }

  const now = new Date();

  await AsnInfo.updateOne(
    { asn },
    {
      $set: {
        asn,
        number,
        name: name || null,
        country: country || null,
        source: source || null,
        raw,
        populationCoverageTotal: populationCoverageTotal || null,
        populationCoverageDirect: populationCoverageDirect || null,
        populationCoverageIndirect: populationCoverageIndirect || null,
        asCoverageTotal: asCoverageTotal || null,
        lastUpdatedAt: now,
      },
      $setOnInsert: {
        firstSeenAt: now,
      },
    },
    { upsert: true }
  );
};

const AsnInfo = mongoose.model('AsnInfo', AsnInfoSchema);

module.exports = AsnInfo;