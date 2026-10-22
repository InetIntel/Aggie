// Handles CRUD requests for SMTC-created tags.
var SMTCTag = require('../../models/tag');
var Group = require('../../models/group');
var _ = require('lodash');
const validator = require('validator');
const eventRouter = require('../sockets/event-router');
const { hasPermission } = require('../../access/permissions');

// Everyone who can view data can create a shared special tag. Never accept
// category, ownership, or editing flags from this less-privileged endpoint.
exports.tag_create_special = (req, res) => {
  const { name, color = '#7c3aed', description = '' } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 ||
      typeof description !== 'string' || description.length > 1000 ||
      typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
    return res.status(400).send('Provide a name (up to 80 characters), a hex color, and an optional description (up to 1000 characters).');
  }
  req.body = { name: name.trim(), color, description: description.trim(), category: 'special', isCommentTag: false };
  return exports.tag_create(req, res);
};

// Get a list of all Tags
exports.tag_tags = (req, res) => {
  SMTCTag.find({}, (err, tags) => {
    if (err) res.status(err.status).send(err.message);
    else res.status(200).send(tags);
  }).populate({ path: 'user', select: 'username' });
};

// Create a new Tag
exports.tag_create = (req, res) => {
  if (req.user) req.body.user = req.user._id;

  if (!req.body.name) {
    return res.status(400).send('Please provide tag name.');
  }

  SMTCTag.create(req.body, function (err, tag) {
    err = Error.decode(err);
    if (err) {
      console.log(err);
      res.status(err.status).send(err.message);
    } else {
      eventRouter.publish('tags:create', tag).then(() => {
        res.status(200).send(tag);
      });
    }
  });
};

// Update a Tag
exports.tag_update = (req, res) => {
  // Find tag to update
  SMTCTag.findById(req.params._id, function (err, tag) {
    if (err) return res.status(err.status).send(err.message);
    if (!tag) return res.sendStatus(404);
    const actor = req.accessUser;
    const canManage = hasPermission(actor, 'edit tags');
    const isCreator = actor && actor._id && tag.user &&
      String(actor._id) === String(tag.user._id || tag.user);
    if (!canManage && !(tag.category === 'special' && isCreator)) {
      return res.status(403).send('Only the creator or a tag manager can edit this custom tag.');
    }
    if (tag.category === 'special' || !canManage) {
      const { name = tag.name, color = tag.color, description = tag.description || '' } = req.body;
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 ||
          typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color) ||
          typeof description !== 'string' || description.length > 1000) {
        return res.status(400).send('Provide a valid name, hex color, and description.');
      }
      req.body = { name: name.trim(), color, description: description.trim() };
    }
    // Update the actual values
    tag = _.extend(tag, _.pick(req.body, 'name', 'color', 'description', 'category', 'isCommentTag'));

    // Update the values
    tag.save((err) => {
      if (err) {
        res.status(err.status).send(err.message);
      } else {
        eventRouter.publish('tags:update', tag).then(() => {
          res.sendStatus(200);
        });
      }
    });
  });
};

// Delete a Tag
exports.tag_delete = async (req, res) => {
  try {
    const tag = await SMTCTag.findById(req.params._id);
    if (!tag) return res.sendStatus(404);

    await Group.updateMany(
      { smtcTags: tag._id },
      { $pull: { smtcTags: tag._id } }
    );
    await tag.remove();
    await eventRouter.publish('tags:delete', tag);

    return res.sendStatus(200);
  } catch (err) {
    err = Error.decode(err);
    return res.status(err.status || 500).send(err.message);
  }
};
