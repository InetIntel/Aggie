'use strict';

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const User = require('../../models/user');

router.get('/overview', User.can('view data'), analyticsController.analytics_overview);
router.get('/notable-activities', User.can('view data'), analyticsController.analytics_notable_activities);
router.post('/notable-activities/incident', User.can('edit data'), analyticsController.analytics_create_incident);
router.patch('/notable-activities/incident', User.can('edit data'), analyticsController.analytics_update_incident);

module.exports = router;
