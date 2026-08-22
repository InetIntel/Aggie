'use strict'
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

// Get teams manageable by current user
router.get('/manageable', teamController.team_manageable_list);

// Get teams available when assigning incident access
router.get('/incident-access', teamController.team_incident_access_list);

// Get all teams
router.get('', teamController.team_list);

// Add or update a team member
router.put('/:_id/member', teamController.team_add_member);

// Remove a team member
router.delete('/:_id/member/:userId', teamController.team_remove_member);

// Get a team with its assigned users
router.get('/:_id', teamController.team_detail);

// Create a team
router.post('', teamController.team_create);

// Delete a team
router.delete('/:_id', teamController.team_delete);

/*
test for api call for delete
console.log('Loaded teamRoutes with DELETE /:_id');
*/

/*
router.delete('/test-delete', (req, res) => {
  return res.status(200).send('delete route works');
});
*/

module.exports = router;
