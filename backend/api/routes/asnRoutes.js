'use strict';
const express = require('express');
const router = express.Router();
const asnController = require('../controllers/asnController');
const User = require('../../models/user');

// Get a list of all asns from latest fetch
router.get('', User.can('view data'), asnController.asn_list);

// Bulk lookup as names based on a list of asn 
router.post('/bulk', User.can('view data'), asnController.asn_bulk);

module.exports = router;
