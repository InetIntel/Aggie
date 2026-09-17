'use strict';

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const User = require('../../models/user');
const {
  loadIncidentAccessContext,
  requireReportIncidentAccess,
} = require('../middlewares/incidentAccessMiddlewares');
const { allowGlobalOrScoped } = require('../middlewares/scopedPermissionMiddlewares');
const { loadReportSourceAccessFilter } = require('../utils/reportSourceAccess');
const NotableActivity = require('../../models/notableActivity');
const Report = require('../../models/report');
const reportController = require('../controllers/reportController');

// Resolves the snapshot and restates
// the request in the shape those middlewares already understand, so they can run
// unchanged rather than a second copy of the same checks being written here.
const describeSnapshotForAccessChecks = async (req, res, next) => {
  try {
    const { cacheKey, eventAggKey } = req.body || {};
    if (!cacheKey || !eventAggKey) return next();

    const snapshot = await NotableActivity.findOne({ cacheKey, eventAggKey })
      .select('reportIds incidentId')
      .lean()
      .exec();
    if (!snapshot) return next();

    // requireReportAccess requires every id to resolve
    // dropping unresolvable ones
    const snapshotIds = (snapshot.reportIds || []).map(String);
    const existingIds = await Report.find({ _id: { $in: snapshotIds } })
      .select('_id')
      .lean()
      .exec();
    req.body.ids = existingIds.map((report) => String(report._id));


    // requireReportIncidentAccess skips every check when the id list is empty,
    // so here refuse snapshot whose reports have all been deleted 
    if (snapshotIds.length > 0 && req.body.ids.length === 0) {
      return res
        .status(409)
        .send('This activity\'s reports are no longer available. Refresh the dashboard and try again.');
    }

    const targetId = req.body.groupId || snapshot.incidentId;
    if (targetId) req.body.group = { _id: String(targetId) };

    return next();
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to check incident access.');
  }
};

// Analytics aggregates the same reports the /report routes serve, so the read routes
// carry the same access context. loadReportSourceAccessFilter scopes report reads to
// the caller's sources; loadIncidentAccessContext supplies the team context used to
// hide incident references the caller cannot view.
router.get(
  '/overview',
  User.can('view data'),
  loadReportSourceAccessFilter,
  loadIncidentAccessContext,
  analyticsController.analytics_overview
);
router.get(
  '/report-metrics',
  User.can('view data'),
  loadReportSourceAccessFilter,
  analyticsController.analytics_report_metrics
);
router.get(
  '/notable-activities',
  User.can('view data'),
  loadReportSourceAccessFilter,
  loadIncidentAccessContext,
  analyticsController.analytics_notable_activities
);

// Same middleware chain PATCH /api/report/_group uses, makes these
// mutations honor incident access policies.
const snapshotMutationAccess = [
  allowGlobalOrScoped('edit data'),
  describeSnapshotForAccessChecks,
  reportController.requireReportAccess,
  loadIncidentAccessContext,
  requireReportIncidentAccess,
];

router.post('/notable-activities/incident', snapshotMutationAccess, analyticsController.analytics_create_incident);
router.patch('/notable-activities/incident', snapshotMutationAccess, analyticsController.analytics_update_incident);

module.exports = router;
