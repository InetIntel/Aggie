'use strict';
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const auth = require('../authentication')();
const User = require('../../models/user');
const {
  loadIncidentAccessContext,
  requireIncidentQueryAccess,
  requireReportIncidentAccess,
} = require('../middlewares/incidentAccessMiddlewares');
const { allowGlobalOrScoped } = require('../middlewares/scopedPermissionMiddlewares');

// Get list of reports
router.get('', User.can("view data"), requireIncidentQueryAccess, reportController.report_reports);

// Get batch of reports
router.get('/batch', User.can('view data'), reportController.report_batch);

// Get new batch of reports
router.patch('/batch', User.can('edit data'), reportController.report_batch_new);

// Cancel batch of reports
router.put('/batch', User.can('edit data'), reportController.report_batch_cancel);

// Get report details
router.get('/:_id', User.can('view data'), reportController.requireReportAccess, reportController.report_details);

// Get report comments
router.get('/comments/:_id', User.can('view data'), reportController.requireReportAccess, reportController.report_comments);

// Update individual report
router.put('/:_id', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.report_update);

// Update reports veracity
router.patch('/_veracity', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_veracity_update);

// Update reports read
router.patch('/_read', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_read_update);

// Update reports escalation
router.patch('/_escalated', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_escalated_update);

// Update reports escalation
router.patch('/_irrelevance', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_irrelevant_update);

// Add reports to group
router.patch('/_group', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, loadIncidentAccessContext, requireReportIncidentAccess, reportController.reports_group_update);
// remove reports from group
router.patch('/_group-rm', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, loadIncidentAccessContext, requireReportIncidentAccess, reportController.reports_group_remove);

// Update reports notes
router.patch('/_notes', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_notes_update);

// Add tag to reports
router.patch('/_tag', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_tags_add);

// Remove tag from reports
router.patch('/_untag', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_tags_remove);

// Update tags from reports
router.patch('/_tags', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_tags_update);

// Clear tags from reports
router.patch('/_clearTags', allowGlobalOrScoped('edit data'), reportController.requireReportAccess, reportController.reports_tags_clear);

module.exports = router;
