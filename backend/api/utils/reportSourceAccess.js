'use strict';
// Shared source-access filtering for any endpoint that reads reports.
//
// Extracted from reportController so the reports list, the batch endpoints and the
// analytics aggregates all derive the caller's visible-report filter from one
// implementation. An endpoint that skips this returns reports from sources the
// caller's teams are not permitted to see.

const Source = require('../../models/source');
const User = require('../../models/user');
const { buildReportSourceAccessFilter } = require('../../access/sourceAccess');

const getReportAccessUser = async (req) => {
  if (req.accessUser) {
    return req.accessUser;
  }

  if (!req.user) {
    return null;
  }

  if (req.user.role === 'admin') {
    return req.user;
  }

  const userId = req.user._id || req.user.id;

  return User.findById(userId)
    .select('_id role teams teamMemberships')
    .lean();
};

const getReportSourceAccessFilter = async (req) => {
  const accessUser = await getReportAccessUser(req);

  if (accessUser && accessUser.role === 'admin') {
    return {};
  }

  const sources = await Source.find({}, '_id accessPolicy')
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
  getReportAccessUser,
  getReportSourceAccessFilter,
  loadReportSourceAccessFilter,
};
