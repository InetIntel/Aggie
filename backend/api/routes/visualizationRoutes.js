'use strict'
var express = require('express');
var router = express.Router();
const visualizationController = require('../controllers/visualizationController');
const User = require('../../models/user');

// These collections contain global precomputed totals and cannot be filtered by
// source/team after aggregation. Keep them behind the dedicated global-trends
// permission until the aggregation job stores an access-policy dimension.
router.get("/media", User.can("manage trends"), visualizationController.visualization_media);
router.get("/time", User.can("manage trends"), visualizationController.visualization_time);
router.get("/tags", User.can("manage trends"), visualizationController.visualization_tags);
router.get("/authors", User.can("manage trends"), visualizationController.visualization_authors);
router.get("/words", User.can("manage trends"), visualizationController.visualization_words);

module.exports = router;
