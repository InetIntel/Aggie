// Handles CRUD requests for SMTC-created tags.
var SMTCTag = require('../../models/tag');
var Group = require('../../models/group');
var _ = require('lodash');
const validator = require('validator');
const eventRouter = require('../sockets/event-router');

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
    // Update the actual values
    tag = _.extend(tag, _.omit(req.body, 'creator'));

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
