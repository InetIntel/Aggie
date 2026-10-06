// Handles CRUD requests for sources.
'use strict';

var Source = require('../../models/source');
var Report = require('../../models/report');
var _ = require('lodash');

const User = require('../../models/user');
const { canManageSource, canViewSource } = require('../../access/sourceAccess');
const SUPPORTED_OONI_TESTS = require('../../config/models/ooniTests');

// How far back the "observed ASNs" summary looks for asn-scoped reports.
const OBSERVED_ASN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Light, defensive normalization of the structured per-media config so a bad
// value can't reach the schema cast (500) or the fetching channel. Mutates the
// request body in place; returns an error message string, or null when valid.
var normalizeStructuredConfig = function (body) {
  if (!body) return null;

  if (body.asns !== undefined) {
    if (!Array.isArray(body.asns)) return 'asns must be an array of ASN numbers.';
    const cleaned = body.asns
      .map((asn) => Number(asn))
      .filter((asn) => Number.isInteger(asn) && asn > 0);
    body.asns = cleaned;
  }

  if (body.ooniTestName) {
    if (!SUPPORTED_OONI_TESTS.includes(body.ooniTestName)) {
      return 'Unsupported OONI test.';
    }
  }

  if (body.ooniDomains !== undefined) {
    if (!Array.isArray(body.ooniDomains)) return 'ooniDomains must be an array of domains.';
    body.ooniDomains = body.ooniDomains
      .map((domain) => String(domain || '').trim())
      .filter(Boolean);
  }

  return null;
};

var sourcePopulate = [
  { path: 'user', select: 'username' },
  { path: 'credentials' },
  { path: 'accessPolicy.teams', select: 'name description active' },
];


//Access control

const getSourceAccessUser = async (req) => {
  if (req.accessUser) {
    return req.accessUser;
  }

  if (!req.user) {
    return null;
  }

  // Admins can see everything, so no extra lookup needed.
  if (req.user.role === 'admin') {
    return req.user;
  }

  const userId = req.user._id || req.user.id;

  return User.findById(userId)
    .select('_id role teams teamMemberships')
    .lean();
};

// Create a new Source
exports.source_create = (req, res) => {
  if (!canManageSource(req.accessUser || req.user)) {
    return res.status(403).send('Unauthorized to create sources.');
  }

  // set user as the logged in user
  if (req.user) req.body.user = req.user._id;

  const configError = normalizeStructuredConfig(req.body);
  if (configError) return res.status(400).send(configError);

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

// GET /api/source/:_id/observed-asns
// Summarize which ASNs a source has actually produced (asn-scoped) reports for
// recently. Read-only visibility — used by the Cloudflare feed details view,
// where collection is country-wide and the ASNs seen aren't a configured input.
exports.source_observed_asns = async (req, res) => {
  try {
    const source = await Source.findById(req.params._id);
    if (!source) return res.sendStatus(404);

    const accessUser = await getSourceAccessUser(req);
    if (res.headersSent) return;

    if (!canViewSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to view this source.');
    }

    const since = new Date(Date.now() - OBSERVED_ASN_WINDOW_MS);

    const rows = await Report.aggregate([
      {
        $match: {
          _sources: String(source._id),
          isAsnScoped: true,
          asn: { $ne: null },
          fetchedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: '$asn',
          count: { $sum: 1 },
          lastSeen: { $max: '$fetchedAt' },
          geoScope: { $last: '$geoScope' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const observed = rows.map((row) => ({
      asn: row._id,
      count: row.count,
      lastSeen: row.lastSeen,
      geoScope: row.geoScope,
    }));

    return res.status(200).send(observed);
  } catch (err) {
    if (res.headersSent) return;
    return res
      .status(err.status || 500)
      .send(err.message || 'Unable to fetch observed ASNs.');
  }
};

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

    if (res.headersSent) return;

    if (!canManageSource(accessUser, source)) {
      return res.status(403).send('Unauthorized to update this source.');
    }

    const configError = normalizeStructuredConfig(req.body);
    if (configError) return res.status(400).send(configError);

    normalizeAccessPolicy(req.body);

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
