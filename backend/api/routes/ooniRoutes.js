'use strict';
const express = require('express');
const router = express.Router();
const ooniController = require('../controllers/ooniController');
const User = require('../../models/user');

// Daily measurement counts for one watched ASN, used by the OONI alert chart
router.get('/series', User.can('view data'), ooniController.ooni_series);

module.exports = router;
