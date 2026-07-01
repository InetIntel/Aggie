'use strict'
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const User = require('../../models/user');

// Get teams manageable by current user
router.get('/manageable', teamController.team_manageable_list);

// Get all teams
router.get('', User.can('admin users'), teamController.team_list);

// Create a team
router.post('', User.can('admin users'), teamController.team_create);

/*
router.delete('/test-delete', (req, res) => {
  return res.status(200).send('delete route works');
});
*/

// Delete a team
router.delete('/:_id', teamController.team_delete);

//test for api call for delete
//console.log('Loaded teamRoutes with DELETE /:_id');

module.exports = router;