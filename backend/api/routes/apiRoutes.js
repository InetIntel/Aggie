const express = require('express');
const router = express.Router();
const asnRouter = require('./asnRoutes');
const credentialRouter = require('./credentialsRoutes');
const csvRouter = require('./csvRoutes');
const geoScopeRouter = require('./geoScopeRoutes');
const groupRouter = require('./groupRoutes');
const reportRouter = require('./reportRoutes');
const settingRouter = require('./settingRoutes');
const sourceRouter = require('./sourceRoutes');
const tagRouter = require('./tagRoutes');
const userRouter = require('./userRoutes');
const searchRouter = require('./searchRoutes');
const visualizationRouter = require('./visualizationRoutes');

// Add all API routes
router.use('/asn', asnRouter);
router.use('/credential', credentialRouter);
router.use('/csv', csvRouter);
router.use('/geoscope', geoScopeRouter);
router.use('/group', groupRouter);
router.use('/report', reportRouter);
router.use('/setting', settingRouter);
router.use('/source', sourceRouter);
router.use('/search', searchRouter);
router.use('/tag', tagRouter);
router.use('/user', userRouter);
router.use('/visualization', visualizationRouter);
module.exports = router;


