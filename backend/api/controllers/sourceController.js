// Handles CRUD requests for sources.
'use strict';

var Source = require('../../models/source');
var _ = require('lodash');

const { canManageSource, canViewSource } = require('../../access/sourceAccess');
const { normalizeCountryCodes } = require('../../access/countryCodes');
const { getSourceAccessUser } = require('../utils/sourceAccessUser');

var sourcePopulate = [
  { path: 'user', select: 'username' },
  { path: 'credentials' },
  { path: 'accessPolicy.teams', select: 'name description active' },
];

// Create a new Source
exports.source_create = (req, res) => {
  if (!canManageSource(req.accessUser || req.user)) {
    return res.status(403).send('Unauthorized to create sources.');
  }

  // set user as the logged in user
  if (req.user) req.body.user = req.user._id;

  try {
    normalizeSourceCountries(req.body);
    normalizeAccessPolicy(req.body);
    validateCountryAccessPolicy(req.body);
  } catch (err) {
    return res.status(err.status || 400).send(err.message);
  }

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
    const sources = await Source.find({}, '-events')
      .sort('nickname')
      .populate(sourcePopulate)
      .exec();

    const counts = await Source.aggregate([
      {
        $project: {
          distinctErrorCount: {
            $size: { $slice: [{ $ifNull: ['$events', []] }, -50] },
          },
        },
      },
    ]);
    const countById = {};
    counts.forEach((count) => {
      countById[count._id.toString()] = count.distinctErrorCount;
    });

    const accessUser = await getSourceAccessUser(req);
    const visibleSources = sources
      .filter((source) => canViewSource(accessUser, source))
      .map((source) => {
        const obj = source.toObject();
        obj.distinctErrorCount = countById[source._id.toString()] || 0;
        return obj;
      });

    if (res.headersSent) return;

    return res.status(200).send(visibleSources);
  } catch (err) {
    if (res.headersSent) return;

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

          if (res.headersSent) return;

          if (!canViewSource(accessUser, source)) {
            return res.status(403).send('Unauthorized to view this source.');
          }

          const obj = source.toObject();
          obj.distinctErrorCount = Source.distinctErrorCount(source.events);
          return res.status(200).send(obj);
        } catch (err) {
          if (res.headersSent) return;

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

  if (accessPolicy.mode === 'country_restricted') {
    accessPolicy.teams = [];
    accessPolicy.cutoffDate = null;
  }
};

var normalizeSourceCountries = function (sourceData) {
  if (sourceData.countryCodes === undefined) return;
  sourceData.countryCodes = normalizeCountryCodes(sourceData.countryCodes);
};

var validateCountryAccessPolicy = function (sourceData, currentSource) {
  const accessPolicy = sourceData.accessPolicy || (currentSource && currentSource.accessPolicy);
  if (!accessPolicy || accessPolicy.mode !== 'country_restricted') return;

  const countryCodes = sourceData.countryCodes !== undefined
    ? sourceData.countryCodes
    : currentSource && currentSource.countryCodes;

  if (!Array.isArray(countryCodes) || countryCodes.length === 0) {
    const err = new Error('Choose at least one country for country-restricted access.');
    err.status = 400;
    throw err;
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

    if (res.headersSent) return;

    if (!canManageSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to update this source.');
    }

    normalizeSourceCountries(req.body);
    normalizeAccessPolicy(req.body);
    validateCountryAccessPolicy(req.body, source);

    // Update the actual values
    _.forEach(_.omit(req.body, ['_id', 'user', 'events']), function (val, key) {
      source[key] = val;
    });

    await source.save();

    return res.sendStatus(200);
  } catch (err) {
    if (res.headersSent) return;

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

    if (res.headersSent) return;

    if (!canManageSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to reset this source.');
    }

    Source.resetUnreadErrorCount(req.params._id, function (err, source) {
      if (res.headersSent) return;
      if (err) return res.status(err.status || 500).send(err.message);
      if (!source) return res.sendStatus(404);

      return res.status(200).send(source);
    });
  } catch (err) {
    if (res.headersSent) return;

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

    if (res.headersSent) return;

    if (!canManageSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to delete this source.');
    }

    source.remove((err) => {
      if (res.headersSent) return;
      if (err) return res.status(err.status || 500).send(err.message);

      return res.sendStatus(200);
    });
  } catch (err) {
    if (res.headersSent) return;

    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to delete source.');
  }
}

// Delete all Sources
exports.source_delete_all = (req, res) => {
  if (!canManageSource(req.accessUser || req.user)) {
    return res.status(403).send('Unauthorized to delete sources.');
  }

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
  if (!canManageSource(req.accessUser || req.user)) {
    return res.status(403).send('Unauthorized to update sources.');
  }

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
