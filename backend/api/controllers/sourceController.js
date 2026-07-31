// Handles CRUD requests for sources.
'use strict';

var Source = require('../../models/source');
var _ = require('lodash');

const User = require('../../models/user');
const { canViewSource } = require('../../access/sourceAccess');

var sourcePopulate = [
  { path: 'user', select: 'username' },
  { path: 'credentials' },
  { path: 'accessPolicy.teams', select: 'name description active' },
];


//Access control

const getSourceAccessUser = async (req) => {
  if (!req.user) {
    return null;
  }

  // Admins can see everything, so no extra lookup needed.
  if (req.user.role === 'admin') {
    return req.user;
  }

  const userId = req.user._id || req.user.id;

  return User.findById(userId)
    .select('_id role teams')
    .lean();
};

// Create a new Source
exports.source_create = (req, res) => {
  // set user as the logged in user
  if (req.user) req.body.user = req.user._id;

  normalizeAccessPolicy(req.body);

  Source.create(req.body, function (err, source) {
    if (err) {
      return res.status(err.status).send(err.message);
    }

    res.status(200).send(source);
  });
}

// Get a list of all sources
exports.source_sources = async (req, res) => {
  try {
    // Find all, exclude `events` field, populate user/team access data
    const sources = await Source.find({}, '-events')
      .sort('nickname')
      .populate(sourcePopulate)
      .lean()
      .exec();

    const accessUser = await getSourceAccessUser(req);
    const visibleSources = sources.filter((source) =>
      canViewSource(accessUser, source)
    );

    return res.status(200).send(visibleSources);
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to fetch sources.');
  }
}

exports.source_details = (req, res) => {
  Source.findByIdWithLatestEvents(req.params._id, function (err, source) {
    if (err) return res.status(err.status || 500).send(err.message);
    if (!source) return res.sendStatus(404);

    Source.populate(
      source,
      sourcePopulate,
      async function (err, source) {
        if (err) return res.status(err.status || 500).send(err.message);

        try {
          const accessUser = await getSourceAccessUser(req);

          if (!canViewSource(accessUser, source)) {
            return res.status(403).send('Unauthorized to view this source.');
          }

          return res.status(200).send(source);
        } catch (err) {
          return res
            .status(err.status || 500)
            .send(err.message || 'Unable to check source access.');
        }
      }
    );
  });
}

//helper for source.lpopulate
var normalizeAccessPolicy = function (sourceData) {
  if (!sourceData.accessPolicy) return;

  var accessPolicy = sourceData.accessPolicy;

  if (!accessPolicy.mode) {
    accessPolicy.mode = 'public';
  }

  if (!Array.isArray(accessPolicy.teams)) {
    accessPolicy.teams = [];
  }

  if (accessPolicy.cutoffDate === '') {
    accessPolicy.cutoffDate = null;
  }

  if (accessPolicy.mode === 'public') {
    accessPolicy.teams = [];
    accessPolicy.cutoffDate = null;
  }

  if (accessPolicy.mode === 'restricted') {
    accessPolicy.cutoffDate = null;
  }
};


exports.source_update = async (req, res, next) => {
  if (req.params._id === '_events') return next();

  try {
    const source = await Source.findById(req.params._id);

    if (!source) {
      return res.sendStatus(404);
    }

    const accessUser = await getSourceAccessUser(req);

    if (!canViewSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to update this source.');
    }

    normalizeAccessPolicy(req.body);

    // Update the actual values
    _.forEach(_.omit(req.body, ['_id', 'user', 'events']), function (val, key) {
      source[key] = val;
    });

    await source.save();

    return res.sendStatus(200);
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to update source.');
  }
}

exports.source_reset_errors = async (req, res) => {
  try {
    const source = await Source.findById(req.params._id);

    if (!source) {
      return res.sendStatus(404);
    }

    const accessUser = await getSourceAccessUser(req);

    if (!canViewSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to reset this source.');
    }

    Source.resetUnreadErrorCount(req.params._id, function (err, source) {
      if (err) return res.status(err.status || 500).send(err.message);
      if (!source) return res.sendStatus(404);

      return res.status(200).send(source);
    });
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to reset source errors.');
  }
}
// Delete a Source
exports.source_delete = async (req, res, next) => {
  if (req.params._id === '_all') return next();

  try {
    const source = await Source.findById(req.params._id);

    if (!source) {
      return res.sendStatus(404);
    }

    const accessUser = await getSourceAccessUser(req);

    if (!canViewSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to delete this source.');
    }

    source.remove((err) => {
      if (err) return res.status(err.status || 500).send(err.message);

      return res.sendStatus(200);
    });
  } catch (err) {
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to delete source.');
  }
}

// Delete all Sources
exports.source_delete_all = (req, res) => {
  Source.find(function (err, sources) {
    if (err) return res.status(err.status).send(err.message);
    if (sources.length === 0) return res.sendStatus(200);
    var remaining = sources.length;
    sources.forEach(function (source) {
      // Delete each source explicitly to catch it in model
      source.remove((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        
        if (--remaining === 0) return res.sendStatus(200);
      });
    });
  });
}

// update sources TODO: This doesn't work I'm just putting a placeholder here.
exports.source_update_all = (req, res) => {
  Source.find(function (err, sources) {
    if (err) return res.status(err.status).send(err.message);
    if (sources.length === 0) return res.sendStatus(200);
    var remaining = sources.length;
    sources.forEach(function (source) {
      // Delete each source explicitly to catch it in model
      source.remove((err) => {
        if (err) {
          if (!res.headersSent) res.status(err.status).send(err.message)
          return;
        }
        if (--remaining === 0) return res.sendStatus(200);
      });
    });
  });
}