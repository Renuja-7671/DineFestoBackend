const express = require('express');
const cronController = require('../controllers/cron.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/forecast', cronController.runForecastCron);

router.post(
  '/forecast/train',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  cronController.runForecastManual
);

module.exports = router;
