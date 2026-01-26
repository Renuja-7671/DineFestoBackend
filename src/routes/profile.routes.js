const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All profile routes require authentication
router.use(authenticate);

// Get current user profile
router.get('/', profileController.getProfile);

// Update profile
router.put('/', profileController.updateProfile);

// Change password
router.put('/password', profileController.changePassword);

// Get user activity/stats
router.get('/activity', profileController.getUserActivity);

// Delete account
router.delete('/', profileController.deleteAccount);

module.exports = router;
