'use strict';
// Shared source-access filtering for any endpoint that reads reports.
//
// Extracted from reportController so the reports list, the batch endpoints and the
// analytics aggregates all derive the caller's visible-report filter from one
// implementation. An endpoint that skips this returns reports from sources the
// caller's teams are not permitted to see.

const Source = require('../../models/source');
const { buildReportSourceAccessFilter } = require('../../access/sourceAccess');
const { getSourceAccessUser } = require('./sourceAccessUser');

const getReportSourceAccessFilter = async (req) => {
  const accessUser = await getSourceAccessUser(req);

  if (accessUser && accessUser.role === 'admin') {
    return {};
  }

  const sources = await Source.find({}, '_id accessPolicy countryCodes')
    .lean()
    .exec();

  return buildReportSourceAccessFilter(accessUser, sources);
};

const combineReportFilters = (filter, sourceAccessFilter) => {
  if (!sourceAccessFilter || Object.keys(sourceAccessFilter).length === 0) {
    return filter;
  }

  return { $and: [filter, sourceAccessFilter] };
};

// Middleware form: populates req.reportSourceAccessFilter for downstream handlers.
const loadReportSourceAccessFilter = async (req, res, next) => {
  if (req.reportSourceAccessFilter) return next();

  try {
    req.reportSourceAccessFilter = await getReportSourceAccessFilter(req);
    return next();
  } catch (err) {
    if (res.headersSent) return;
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to check report access.');
  }
};

module.exports = {
  combineReportFilters,
  getReportAccessUser: getSourceAccessUser,
  getReportSourceAccessFilter,
  loadReportSourceAccessFilter,
};
