const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateNotificationSettings,
  updateAppearanceSettings,
  getSystemSettings,
  updateSystemSettings,
  getSecurityLogs,
} = require('../controllers/settings.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// User settings routes (authenticated users)
router.get('/', authenticate, getSettings);
router.put('/notifications', authenticate, updateNotificationSettings);
router.put('/appearance', authenticate, updateAppearanceSettings);

// System settings routes (admin only)
router.get('/system', authenticate, authorize(['ADMIN']), getSystemSettings);
router.put('/system', authenticate, authorize(['ADMIN']), updateSystemSettings);

// Security logs routes (admin only)
router.get('/security-logs', authenticate, authorize(['ADMIN']), getSecurityLogs);

module.exports = router;
