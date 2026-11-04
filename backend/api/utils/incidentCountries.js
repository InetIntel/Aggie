'use strict';

const Source = require('../../models/source');
const { normalizeCountries } = require('../../access/incidentAccess');

const getReportCountries = async (reports) => {
  const sourceIds = [...new Set(reports.flatMap((report) => report._sources || []).map(String))];
  if (!sourceIds.length) return [];
  const sources = await Source.find({ _id: { $in: sourceIds } }).select('countryCodes').lean();
  return normalizeCountries(sources.flatMap((source) => source.countryCodes || []));
};

module.exports = { getReportCountries };
