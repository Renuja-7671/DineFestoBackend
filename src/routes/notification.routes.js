const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

const router = express.Router();

// All notification routes require authentication
// GET /api/notifications            → list with optional ?unreadOnly=true&type=LOW_STOCK&limit=50
router.get('/', authenticate, notificationController.getMyNotifications);

// GET /api/notifications/low-stock  → summary of current unread LOW_STOCK alerts
router.get('/low-stock', authenticate, authorize('ADMIN', 'MANAGER', 'CHEF'), notificationController.getLowStockSummary);

// PATCH /api/notifications/read-all → mark all (or all of a type) as read
router.patch('/read-all', authenticate, notificationController.markAllNotificationsAsRead);

// DELETE /api/notifications         → delete all read notifications for the user
router.delete('/', authenticate, notificationController.clearReadNotifications);

// PATCH /api/notifications/:id/read → mark single notification as read
router.patch('/:id/read', authenticate, notificationController.markNotificationAsRead);

// DELETE /api/notifications/:id     → hard-delete a single notification
router.delete('/:id', authenticate, notificationController.deleteNotification);

module.exports = router;
