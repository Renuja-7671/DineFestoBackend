const prisma = require('../config/database');

/**
 * GET /api/notifications
 * Query params:
 *   - unreadOnly=true  → only unread
 *   - type=LOW_STOCK   → filter by notification type
 *   - limit=50         → max results (capped at 200)
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const { unreadOnly, type, limit = 50 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200);

    const where = {
      userId: req.user.userId,
    };

    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    if (type) {
      where.type = type;
    }

    const [notifications, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parsedLimit,
      }),
      prisma.notification.count({
        where: {
          userId: req.user.userId,
          isRead: false,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message,
    });
  }
};

/**
 * GET /api/notifications/low-stock
 * Returns a summary of current unread low-stock alerts
 * for the requesting admin/manager/chef.
 */
exports.getLowStockSummary = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user.userId,
        type: 'LOW_STOCK',
        isRead: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      success: true,
      data: {
        count: notifications.length,
        notifications,
      },
    });
  } catch (error) {
    console.error('Error fetching low-stock summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low-stock summary',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read (must belong to the requesting user).
 */
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notificationId = parseInt(id, 10);

    if (Number.isNaN(notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const existing = await prisma.notification.findUnique({
      where: { notificationId },
    });

    if (!existing || existing.userId !== req.user.userId) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    const notification = await prisma.notification.update({
      where: { notificationId },
      data: { isRead: true },
    });

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all of the requesting user's unread notifications as read.
 * Optionally filter by type via ?type=LOW_STOCK
 */
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const { type } = req.query;

    const where = {
      userId: req.user.userId,
      isRead: false,
    };

    if (type) {
      where.type = type;
    }

    const result = await prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    res.json({
      success: true,
      data: {
        updatedCount: result.count,
      },
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/notifications/:id
 * Hard-delete a single notification (admin-only or own notification).
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notificationId = parseInt(id, 10);

    if (Number.isNaN(notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const existing = await prisma.notification.findUnique({
      where: { notificationId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // Only the owner or an admin may delete
    if (existing.userId !== req.user.userId && !['ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await prisma.notification.delete({ where: { notificationId } });

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/notifications
 * Delete all read notifications for the requesting user.
 */
exports.clearReadNotifications = async (req, res) => {
  try {
    const result = await prisma.notification.deleteMany({
      where: {
        userId: req.user.userId,
        isRead: true,
      },
    });

    res.json({
      success: true,
      data: { deletedCount: result.count },
    });
  } catch (error) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear read notifications',
      error: error.message,
    });
  }
};
