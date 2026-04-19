'use strict';

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const User = require('../../models/user');

router.get('/overview', User.can('view data'), analyticsController.analytics_overview);
router.get('/notable-activities', User.can('view data'), analyticsController.analytics_notable_activities);

module.exports = router;
