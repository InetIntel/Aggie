'use strict'
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const User = require('../../models/user');

// Get a list of all Users
router.get('', User.can('view other users'), userController.user_users);

// Get names used in incident assignments and filters
router.get('/directory', User.can('view users'), userController.user_directory);

// Get a list of manageable Users
router.get('/manageable', userController.user_manageableUsers);

// Find an existing account to add to a team
router.get('/member-candidates', userController.user_member_candidates);


// Create a user
// Authorization is team-aware and is enforced in the controller. In addition
// to admins and legacy global team leads, explicit team leads may create users
// for teams they lead.
router.post('', userController.user_create);

// Get Individual User
router.get('/:_id', User.can('view users'), userController.user_detail);

// Update User teams
router.put('/:_id/teams', userController.user_update_teams);

// Update Users
router.put('/:_id', User.can('update users'), userController.user_update);

// Delete User
router.delete('/:_id', User.can('delete users'), userController.user_delete);

// Update User password
router.put('/password_set/:_id', User.can('update users'), userController.user_update_password);
module.exports = router;
