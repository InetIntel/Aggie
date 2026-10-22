'use strict';
const express = require('express');
const router = express.Router();
const geoScopeController = require('../controllers/geoScopeController');
const User = require('../../models/user');

router.get('', User.can('view data'), geoScopeController.geoScope_list);

module.exports = router;