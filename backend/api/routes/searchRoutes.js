'use strict';
const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const auth = require('../authentication')();
const User = require('../../models/user');

// Get list of reports
router.get('', User.can("view data"), searchController.search_reports);

module.exports = router;
