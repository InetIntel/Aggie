// Dedup-aware report counting shared by the reports list controller and the
// analytics report-metrics endpoint, so a metric count always equals the list's
// "Showing X of N" for the same query.
'use strict';

const Report = require('../../models/report');
const ReportQuery = require('../../models/query/report-query');

// Whether a reports query should dedup overlapping reports by eventIdentifier.
const shouldDedupByEventIdentifier = (entityLevel, groupId) => {
  if (groupId) return false;
  if (!entityLevel || entityLevel.length === 0) return true;
  return entityLevel.includes('AS') && entityLevel.includes('AS - Country');
};

// Resolve the dedup decision using the exact same override order as report_reports:
// base rule, then reportIds forces off, then an explicit hideDuplicateASNs toggle wins.
const resolveUseDedup = (queryData, { hideDuplicateASNs } = {}) => {
  let useDedup = shouldDedupByEventIdentifier(queryData.entityLevel, queryData.groupId);
  if (queryData.reportIds && queryData.reportIds.length > 0) {
    useDedup = false;
  } else if (hideDuplicateASNs === 'true' || hideDuplicateASNs === 'false') {
    useDedup = hideDuplicateASNs === 'true';
  }
  return useDedup;
};

// Count reports for a parsed query (as produced by reportController.parseQueryData),
// using the same dedup-aware counting path the list uses. `hideDuplicateASNs` is the
// same 'true'/'false' toggle the list honors. Returns a Promise<number>.
const countReports = (queryData, { hideDuplicateASNs } = {}) => {
  const query = new ReportQuery(queryData);
  const filter = query.toMongooseFilter();

  // Same extra overrides queryReports/queryReportsDeduped apply on top of the filter.
  if (query.escalated === 'escalated') filter.escalated = true;
  if (query.escalated === 'unescalated') filter.escalated = false;
  if (query.veracity === 'confirmed true') filter.veracity = 'Confirmed True';
  if (query.veracity === 'confirmed false') filter.veracity = 'Confirmed False';
  if (query.veracity === 'unconfirmed') filter.veracity = 'Unconfirmed';

  if (resolveUseDedup(queryData, { hideDuplicateASNs })) {
    return Report.countReportsDedupedTotal(filter);
  }
  return Report.countDocuments(filter).exec();
};

module.exports = { shouldDedupByEventIdentifier, resolveUseDedup, countReports };
