'use strict'
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const User = require('../../models/user');

// Get all teams
router.get('', teamController.team_list);

// Create a team
router.post('', User.can('admin users'), teamController.team_create);

module.exports = router;
