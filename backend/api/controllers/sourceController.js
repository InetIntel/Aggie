// Handles CRUD requests for sources.
'use strict';

var Source = require('../../models/source');
var _ = require('lodash');

var sourcePopulate = [
  { path: 'user', select: 'username' },
  { path: 'credentials' },
  { path: 'accessPolicy.teams', select: 'name description active' },
];

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
exports.source_sources = (req, res) => {
  // Find all, exclude `events` field, populate user
 Source.find({}, '-events', { sort: 'nickname' })
  .populate(sourcePopulate)
    .exec(function (err, sources) {
      if (err) return res.status(err.status).send(err.message);
      // The list payload strips `events` to stay lean, so compute the count of
      // recent events (the last 50, matching the warnings popup) per source in
      // the DB and merge it into the response.
      var pipeline = [
        { $project: {
            distinctErrorCount: {
              $size: { $slice: [{ $ifNull: ['$events', []] }, -50] },
            },
        } },
      ];
      Source.aggregate(pipeline, function (aggErr, counts) {
        if (aggErr) return res.status(aggErr.status).send(aggErr.message);
        var countById = {};
        counts.forEach(function (c) { countById[c._id.toString()] = c.distinctErrorCount; });
        var result = sources.map(function (source) {
          var obj = source.toObject();
          obj.distinctErrorCount = countById[source._id.toString()] || 0;
          return obj;
        });
        res.status(200).send(result);
      });
    });
}

exports.source_details = (req, res) => {
  Source.findByIdWithLatestEvents(req.params._id, function (err, source) {
    if (err) return res.status(err.status).send(err.message);
    else if (!source) return res.sendStatus(404);
    Source.populate(
      source,
      sourcePopulate,
      function (err, source) {
        if (err) return res.status(err.status).send(err.message);
        var obj = source.toObject();
        // `events` is already capped to the latest window here; dedup for the badge.
        obj.distinctErrorCount = Source.distinctErrorCount(source.events);
        res.status(200).send(obj);
      });
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


exports.source_update = (req, res, next) => {
  if (req.params._id === '_events') return next();
  // Find source to update
  Source.findById(req.params._id, function (err, source) {
    if (err) return res.status(err.status).send(err.message);
    if (!source) return res.sendStatus(404);

    normalizeAccessPolicy(req.body);
    
    // Update the actual values
    _.forEach(_.omit(req.body, ['_id', 'user', 'events']), function (val, key) {
      source[key] = val;
    });
    // Save source
    source.save(function (err, numberAffected) {
      if (err) res.status(err.status).send(err.message);
      else if (!numberAffected) res.sendStatus(404);
      else {
        
        res.sendStatus(200);
      }
    });
  });
}

exports.source_reset_errors = (req, res) => {
  Source.resetUnreadErrorCount(req.params._id, function (err, source) {
    if (err) return res.status(err.status).send(err.message);
    else if (!source) return res.sendStatus(404);
    res.status(200).send(source);
  });
}

// Delete a Source
exports.source_delete = (req, res, next) => {
  if (req.params._id === '_all') return next();
  Source.findById(req.params._id, function (err, source) {
    if (err) return res.status(err.status).send(err.message);
    if (!source) return res.sendStatus(404);
    source.remove((err) => {
      if (err) return res.status(err.status).send(err.message);
      
      res.sendStatus(200);
    });
  });
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