'use strict';

const AsnInfo = require('../../models/asnInfo');

/**
 * GET /api/asn
 * Return all ASN metadata for selection / lookup from latest fetch
 *
 * Query params (optional, for future):
 *   - search: string (we can ignore for now or add simple filter later)
 */
exports.asn_list = async (req, res) => {
  try {

    const asns = await AsnInfo.find({})
      .select("asn number name country source populationCoverageTotal populationCoverageDirect populationCoverageIndirect asCoverageTotal")
      .sort({ number: 1, name: 1 })
      .lean()
      .exec();

    return res.status(200).send(asns);
  } catch (err) {
    console.error('Error in asn_list:', err);
    return res
      .status(err.status || 500)
      .send(err.message || 'Error fetching ASN list');
  }
};

/**
 * POST /api/asn/bulk
 * Body: { asns: ["asn1350", "asn15169", ...] }
 *
 * Returns metadata for the requested ASNs only.
 */
exports.asn_bulk = async (req, res) => {
  try {
    const { asns } = req.body || {};

    if (!Array.isArray(asns) || asns.length === 0) {
      return res.status(400).send('Body must include non-empty "asns" array');
    }

    const docs = await AsnInfo.find({ asn: { $in: asns } })
      .select("asn number name country source populationCoverageTotal populationCoverageDirect populationCoverageIndirect asCoverageTotal")
      .lean()
      .exec();

    // return as a map keyed by asn
    const byAsn = {};
    for (const doc of docs) {
      byAsn[doc.asn] = doc;
    }

    return res.status(200).send(byAsn);
    
  } catch (err) {
    console.error('Error in asn_bulk:', err);
    return res
      .status(err.status || 500)
      .send(err.message || 'Error fetching ASN metadata');
  }
};
