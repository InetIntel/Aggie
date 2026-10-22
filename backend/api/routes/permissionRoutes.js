'use strict';

const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const User = require('../../models/user');

router.use((req, res, next) => {
  if (!req.user) return res.sendStatus(401);
  if (req.user.role !== 'admin') {
    return res.status(403).send('Only administrators can manage global permissions.');
  }
  return next();
});

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
