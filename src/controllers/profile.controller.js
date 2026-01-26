const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        customerProfile: {
          select: {
            customerId: true,
            fullName: true,
            phoneNumber: true,
            loyaltyPoints: true,
          },
        },
        employeeProfile: {
          select: {
            employeeId: true,
            fullName: true,
            designation: true,
            salary: true,
            joinDate: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Remove passwordHash from response
    const profile = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.customerProfile || user.employeeProfile || null,
      profileType: user.customerProfile ? 'customer' : user.employeeProfile ? 'employee' : null,
    };

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message,
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email, fullName, phoneNumber } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { userId },
      include: {
        customerProfile: true,
        employeeProfile: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update email if provided and different
    if (email && email !== existingUser.email) {
      // Check if email already exists
      const emailExists = await prisma.user.findUnique({
        where: { email },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use',
        });
      }

      await prisma.user.update({
        where: { userId },
        data: { email },
      });
    }

    // Update customer profile if exists
    if (existingUser.customerProfile) {
      await prisma.customer.update({
        where: { customerId: existingUser.customerProfile.customerId },
        data: {
          ...(fullName && { fullName }),
          ...(phoneNumber !== undefined && { phoneNumber }),
        },
      });
    }

    // Update employee profile if exists
    if (existingUser.employeeProfile) {
      await prisma.employee.update({
        where: { employeeId: existingUser.employeeProfile.employeeId },
        data: {
          ...(fullName && { fullName }),
        },
      });
    }

    // Fetch updated profile
    const updatedUser = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        customerProfile: {
          select: {
            customerId: true,
            fullName: true,
            phoneNumber: true,
            loyaltyPoints: true,
          },
        },
        employeeProfile: {
          select: {
            employeeId: true,
            fullName: true,
            designation: true,
            salary: true,
            joinDate: true,
          },
        },
      },
    });

    const profile = {
      userId: updatedUser.userId,
      email: updatedUser.email,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      profile: updatedUser.customerProfile || updatedUser.employeeProfile || null,
      profileType: updatedUser.customerProfile ? 'customer' : updatedUser.employeeProfile ? 'employee' : null,
    };

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: profile,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message,
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { userId },
      data: { passwordHash: hashedPassword },
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message,
    });
  }
};

// Get user activity/stats
exports.getUserActivity = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        customerProfile: true,
        employeeProfile: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let activityStats = {};

    // Customer activity
    if (user.customerProfile) {
      const customerId = user.customerProfile.customerId;

      // Total orders
      const totalOrders = await prisma.order.count({
        where: { customerId },
      });

      // Total spent
      const ordersSum = await prisma.order.aggregate({
        where: {
          customerId,
          status: {
            in: ['COMPLETED', 'SERVED'],
          },
        },
        _sum: {
          totalAmount: true,
        },
      });

      // Total reviews
      const totalReviews = await prisma.review.count({
        where: { customerId },
      });

      // Total reservations
      const totalReservations = await prisma.reservation.count({
        where: { customerId },
      });

      // Recent orders
      const recentOrders = await prisma.order.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          orderId: true,
          status: true,
          type: true,
          totalAmount: true,
          createdAt: true,
        },
      });

      activityStats = {
        totalOrders,
        totalSpent: parseFloat(ordersSum._sum.totalAmount || 0),
        totalReviews,
        totalReservations,
        loyaltyPoints: user.customerProfile.loyaltyPoints,
        recentOrders,
      };
    }

    // Employee activity
    if (user.employeeProfile) {
      const employeeId = user.employeeProfile.employeeId;

      // Orders processed
      const ordersProcessed = await prisma.order.count({
        where: { staffId: employeeId },
      });

      // Total revenue generated
      const revenueSum = await prisma.order.aggregate({
        where: {
          staffId: employeeId,
          status: {
            in: ['COMPLETED', 'SERVED'],
          },
        },
        _sum: {
          totalAmount: true,
        },
      });

      // Recent orders processed
      const recentOrdersProcessed = await prisma.order.findMany({
        where: { staffId: employeeId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          orderId: true,
          status: true,
          type: true,
          totalAmount: true,
          createdAt: true,
        },
      });

      activityStats = {
        ordersProcessed,
        revenueGenerated: parseFloat(revenueSum._sum.totalAmount || 0),
        designation: user.employeeProfile.designation,
        joinDate: user.employeeProfile.joinDate,
        recentOrdersProcessed,
      };
    }

    res.status(200).json({
      success: true,
      data: activityStats,
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user activity',
      error: error.message,
    });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete account',
      });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        customerProfile: true,
        employeeProfile: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password',
      });
    }

    // Delete user (cascade will handle related records based on schema)
    await prisma.user.delete({
      where: { userId },
    });

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message,
    });
  }
};
