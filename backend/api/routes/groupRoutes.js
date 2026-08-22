'use strict';
const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const User = require('../../models/user');
const upload = require('../middlewares/groupMiddlewares');
const { MAX_ATTACHMENT_COUNT } = require('../../config/models/groupConfigs');
const {
  loadIncidentAccessContext,
  requireIncidentBodyAccess,
  requireIncidentParamAccess,
  requireIncidentPolicyAccess,
} = require('../middlewares/incidentAccessMiddlewares');
const { allowGlobalOrScoped } = require('../middlewares/scopedPermissionMiddlewares');



// Create a new Group
// User.can('edit data')
router.post('/', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentPolicyAccess, groupController.group_create);

// Get a list of paginated Groups
//User.can('view data')
router.get('/', User.can('view data'), loadIncidentAccessContext, groupController.group_groups);

// Get a list of all Groups
router.get('/all', User.can('view data'), loadIncidentAccessContext, groupController.group_all_groups);

// Get a Group by _id
//User.can('view data')
router.get('/:_id', User.can('view data'), loadIncidentAccessContext, requireIncidentParamAccess, groupController.group_details);

// Update a group
//User.can('edit data'),
router.put('/:_id', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentParamAccess, requireIncidentPolicyAccess, groupController.group_update);

// Delete selected Groups
// User.can('edit data')
router.post('/_selected', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_selected_delete);

// Route to escalate group
router.patch('/_title', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_title_update);

// User.can('edit data')
router.patch('/_tag', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_tags_add);

// Route to escalate group
router.patch('/_escalated', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_escalated_update);

// Route to escalate group
router.patch('/_notes', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_notes_update);

// Route to change closed
router.patch('/_closed', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_closed_update);

// Route to change closed
router.patch('/_public', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_public_update);

// Route to set assign
router.patch('/_assignedto', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_assigned_update);
// Route to change locationName
router.patch('/_locationName', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_locationName_update);


//  User.can('edit data')
router.patch('/_untag', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_tags_remove);

//User.can('edit data')
router.patch('/_clearTags', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_tags_clear);

// Route to add comment
router.patch('/_comment_add', allowGlobalOrScoped('edit data'), upload.array('comment[attachments]', MAX_ATTACHMENT_COUNT), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_comment_add);

// Route to update comment
router.patch('/_comment_update', allowGlobalOrScoped('edit data'), upload.array('comment[attachments]', MAX_ATTACHMENT_COUNT), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_comment_update);

// Route to remove comment
router.patch('/_comment_remove', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentBodyAccess, groupController.group_comment_remove);


// User.can('edit data')
router.delete('/_all', User.can('edit data'), loadIncidentAccessContext, groupController.group_all_delete);

router.delete('/:_id', allowGlobalOrScoped('edit data'), loadIncidentAccessContext, requireIncidentParamAccess, groupController.group_delete);

// User.can('edit data'),
module.exports = router;
