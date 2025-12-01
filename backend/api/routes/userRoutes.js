'use strict'
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const User = require('../../models/user');

// Get a list of all Users
router.get('', User.can('view users'), userController.user_users);

// Get a list of manageable Users
router.get('/manageable', User.can('view users'), userController.user_manageableUsers);


// Create a user
router.post('', User.can('change settings'), userController.user_create);

// Get Individual User
router.get('/:_id', User.can('view users'), userController.user_detail);

// Update Users
router.put('/:_id', User.can('update users'), userController.user_update);

// Delete User
router.delete('/:_id', User.can('delete users'), userController.user_delete);

// Update User password
router.put('/password_set/:_id', User.can('update users'), userController.user_update_password);
module.exports = router;