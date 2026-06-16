const prisma = require('../config/database');

// Get user settings
const getSettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get or create user settings
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      // Create default settings if they don't exist
      settings = await prisma.userSettings.create({
        data: {
          userId,
          emailNotifications: true,
          pushNotifications: true,
          orderNotifications: true,
          reservationNotifications: true,
          reviewNotifications: true,
          marketingEmails: false,
          theme: 'light',
          language: 'en',
          timezone: 'UTC',
          currency: 'LKR',
        },
      });
    }

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
    });
  }
};

// Update notification settings
const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      emailNotifications,
      pushNotifications,
      orderNotifications,
      reservationNotifications,
      reviewNotifications,
      marketingEmails,
    } = req.body;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        emailNotifications,
        pushNotifications,
        orderNotifications,
        reservationNotifications,
        reviewNotifications,
        marketingEmails,
      },
      create: {
        userId,
        emailNotifications,
        pushNotifications,
        orderNotifications,
        reservationNotifications,
        reviewNotifications,
        marketingEmails,
      },
    });

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings',
    });
  }
};

// Update appearance settings
const updateAppearanceSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { theme, language, timezone, currency } = req.body;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        theme,
        language,
        timezone,
        currency,
      },
      create: {
        userId,
        theme,
        language,
        timezone,
        currency,
      },
    });

    res.json({
      success: true,
      message: 'Appearance settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Update appearance settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update appearance settings',
    });
  }
};

// Get system settings (Admin only)
const getSystemSettings = async (req, res) => {
  try {
    // Get system-wide settings from database or config
    const systemSettings = await prisma.systemSettings.findFirst();

    if (!systemSettings) {
      // Create default system settings
      const defaultSettings = await prisma.systemSettings.create({
        data: {
          restaurantName: 'Restaurant Management System',
          restaurantEmail: 'contact@restaurant.com',
          restaurantPhone: '+1234567890',
          restaurantAddress: '123 Main Street, City, State',
          currency: 'LKR',
          timezone: 'UTC',
          taxRate: 10.0,
          serviceChargeRate: 5.0,
          orderPrefix: 'ORD',
          reservationDuration: 120,
          maxGuestsPerReservation: 10,
          advanceReservationDays: 30,
          enableOnlineOrdering: true,
          enableReservations: true,
          enableReviews: true,
          enableLoyaltyProgram: true,
          loyaltyPointsPerDollar: 1,
          maintenanceMode: false,
        },
      });
      return res.json({ success: true, data: defaultSettings });
    }

    res.json({
      success: true,
      data: systemSettings,
    });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system settings',
    });
  }
};

// Update system settings (Admin only)
const updateSystemSettings = async (req, res) => {
  try {
    const {
      restaurantName,
      restaurantEmail,
      restaurantPhone,
      restaurantAddress,
      currency,
      timezone,
      taxRate,
      serviceChargeRate,
      orderPrefix,
      reservationDuration,
      maxGuestsPerReservation,
      advanceReservationDays,
      enableOnlineOrdering,
      enableReservations,
      enableReviews,
      enableLoyaltyProgram,
      loyaltyPointsPerDollar,
      maintenanceMode,
    } = req.body;

    // Check if system settings exist
    let systemSettings = await prisma.systemSettings.findFirst();

    if (!systemSettings) {
      // Create new system settings
      systemSettings = await prisma.systemSettings.create({
        data: {
          restaurantName,
          restaurantEmail,
          restaurantPhone,
          restaurantAddress,
          currency,
          timezone,
          taxRate,
          serviceChargeRate,
          orderPrefix,
          reservationDuration,
          maxGuestsPerReservation,
          advanceReservationDays,
          enableOnlineOrdering,
          enableReservations,
          enableReviews,
          enableLoyaltyProgram,
          loyaltyPointsPerDollar,
          maintenanceMode,
        },
      });
    } else {
      // Update existing system settings
      systemSettings = await prisma.systemSettings.update({
        where: { id: systemSettings.id },
        data: {
          restaurantName,
          restaurantEmail,
          restaurantPhone,
          restaurantAddress,
          currency,
          timezone,
          taxRate,
          serviceChargeRate,
          orderPrefix,
          reservationDuration,
          maxGuestsPerReservation,
          advanceReservationDays,
          enableOnlineOrdering,
          enableReservations,
          enableReviews,
          enableLoyaltyProgram,
          loyaltyPointsPerDollar,
          maintenanceMode,
        },
      });
    }

    res.json({
      success: true,
      message: 'System settings updated successfully',
      data: systemSettings,
    });
  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system settings',
    });
  }
};

// Get security logs (Admin only)
const getSecurityLogs = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const logs = await prisma.securityLog.findMany({
      take: parseInt(limit),
      skip: parseInt(skip),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            email: true,
            role: true,
          },
        },
      },
    });

    const total = await prisma.securityLog.count();

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get security logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security logs',
    });
  }
};

// Log security event
const logSecurityEvent = async (userId, action, ipAddress, userAgent, status, details) => {
  try {
    await prisma.securityLog.create({
      data: {
        userId,
        action,
        ipAddress,
        userAgent,
        status,
        details,
      },
    });
  } catch (error) {
    console.error('Log security event error:', error);
  }
};

module.exports = {
  getSettings,
  updateNotificationSettings,
  updateAppearanceSettings,
  getSystemSettings,
  updateSystemSettings,
  getSecurityLogs,
  logSecurityEvent,
};
