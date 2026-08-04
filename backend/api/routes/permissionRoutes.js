'use strict';

const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const User = require('../../models/user');

router.get(
  '/user/:_id',
  User.can('admin users'),
  permissionController.permission_user_detail
);

router.put(
  '/user/:_id',
  User.can('admin users'),
  permissionController.permission_user_update
);

module.exports = router;
