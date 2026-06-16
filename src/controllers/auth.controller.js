const prisma = require('../config/database');
const { hashPassword, comparePassword, generateToken } = require('../utils/auth.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { sendPasswordResetEmail, sendPasswordResetConfirmation } = require('../utils/email.utils');
const crypto = require('crypto');

/**
 * Register a new user (Customer)
 */
const register = async (req, res, next) => {
  try {
    const { email, password, fullName, phoneNumber } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with customer profile
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CUSTOMER',
        customerProfile: {
          create: {
            fullName,
            phoneNumber,
            loyaltyPoints: 0,
          },
        },
      },
      include: {
        customerProfile: true,
      },
    });

    // Generate token
    const token = generateToken(user.userId, user.role);

    return successResponse(
      res,
      {
        token,
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role,
          profile: user.customerProfile,
        },
      },
      'Registration successful',
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;


    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        customerProfile: true,
        employeeProfile: true,
      },
    });

    if (!user) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);

    if (!isValidPassword) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    if (user.role !== 'CUSTOMER' && user.isActive === false) {
      return errorResponse(res, 'Account deactivated. Contact an administrator.', 403);
    }

    // Generate token
    const token = generateToken(user.userId, user.role);

    // Prepare response based on role
    const profile = user.role === 'CUSTOMER' 
      ? user.customerProfile 
      : user.employeeProfile;

    return successResponse(res, {
      token,
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role,
        profile,
      },
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 */
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        customerProfile: true,
        employeeProfile: true,
      },
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    const profile = user.role === 'CUSTOMER' 
      ? user.customerProfile 
      : user.employeeProfile;

    return successResponse(res, {
      userId: user.userId,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user password
 */
const updatePassword = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Get user
    const user = await prisma.user.findUnique({
      where: { userId },
    });

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      return errorResponse(res, 'Current password is incorrect', 400);
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { userId },
      data: { passwordHash },
    });

    return successResponse(res, null, 'Password updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Create employee account (Admin only)
 */
const createEmployee = async (req, res, next) => {
  try {
    const { email, password, fullName, phoneNumber, designation, salary, role } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // Validate role
    const validRoles = ['WAITER', 'CHEF'];
    if (!validRoles.includes(role)) {
      return errorResponse(res, 'Invalid employee role. Must be WAITER or CHEF', 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with employee profile
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        employeeProfile: {
          create: {
            fullName,
            contact: phoneNumber || null,
            designation,
            salary,
          },
        },
      },
      include: {
        employeeProfile: true,
      },
    });

    return successResponse(
      res,
      {
        userId: user.userId,
        email: user.email,
        role: user.role,
        profile: user.employeeProfile,
      },
      'Employee created successfully',
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get all customers (for admin use)
 */
const getAllCustomers = async (req, res, next) => {
  try {
    // Fetch all customers
    const customers = await prisma.customer.findMany({
      include: {
        user: {
          select: {
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    // Fetch all staff members (users with employee profiles) who might also order
    const staffUsers = await prisma.user.findMany({
      where: {
        role: {
          in: ['ADMIN', 'MANAGER', 'WAITER'],
        },
      },
      include: {
        employeeProfile: true,
        customerProfile: true, // Check if they already have a customer profile
      },
    });

    // Map regular customers
    const mappedCustomers = customers.map(customer => ({
      id: customer.customerId,
      customerId: customer.customerId,
      fullName: customer.fullName,
      email: customer.user?.email || 'N/A',
      phoneNumber: customer.phoneNumber || 'N/A',
      loyaltyPoints: customer.loyaltyPoints,
      role: customer.user?.role || 'CUSTOMER',
      isStaff: customer.user?.role !== 'CUSTOMER',
    }));

    // Map staff members who DON'T have customer profiles yet (show as potential customers)
    const staffWithoutCustomerProfile = staffUsers
      .filter(user => !user.customerProfile) // Only staff who don't have customer profiles
      .map(user => ({
        id: `staff-${user.userId}`,
        customerId: null, // They don't have a customer ID yet
        userId: user.userId,
        fullName: user.employeeProfile?.fullName || user.email.split('@')[0],
        email: user.email,
        phoneNumber: user.employeeProfile?.contact || 'N/A',
        loyaltyPoints: 0,
        role: user.role,
        isStaff: true,
        needsCustomerProfile: true, // Flag to indicate they need a customer profile created
      }));

    // Combine both lists, with staff first
    const allCustomers = [
      ...staffWithoutCustomerProfile,
      ...mappedCustomers,
    ];

    return successResponse(res, allCustomers, 'Customers fetched successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot password - send reset email
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        customerProfile: true,
        employeeProfile: true,
      },
    });

    // Always return success message (don't reveal if email exists)
    if (!user) {
      return successResponse(
        res,
        null,
        'If an account exists with this email, a password reset link has been sent.'
      );
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token to database
    await prisma.user.update({
      where: { userId: user.userId },
      data: {
        resetToken: resetTokenHash,
        resetTokenExpiry,
      },
    });

    // Get user's name
    const userName = user.role === 'CUSTOMER' 
      ? user.customerProfile?.fullName 
      : user.employeeProfile?.fullName;

    // Send reset email
    try {
      await sendPasswordResetEmail(email, resetToken, userName);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Reset token still saved, but email failed
      return errorResponse(
        res,
        'Failed to send password reset email. Please try again later.',
        500
      );
    }

    return successResponse(
      res,
      null,
      'If an account exists with this email, a password reset link has been sent.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password using reset token
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return errorResponse(res, 'Token and new password are required', 400);
    }

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: resetTokenHash,
        resetTokenExpiry: {
          gt: new Date(), // Token not expired
        },
      },
      include: {
        customerProfile: true,
        employeeProfile: true,
      },
    });

    if (!user) {
      return errorResponse(
        res,
        'Invalid or expired reset token. Please request a new password reset.',
        400
      );
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password and clear reset token
    await prisma.user.update({
      where: { userId: user.userId },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // Get user's name
    const userName = user.role === 'CUSTOMER' 
      ? user.customerProfile?.fullName 
      : user.employeeProfile?.fullName;

    // Send confirmation email (don't fail if this fails)
    try {
      await sendPasswordResetConfirmation(user.email, userName);
    } catch (emailError) {
      console.error('Failed to send password reset confirmation:', emailError);
    }

    return successResponse(
      res,
      null,
      'Password reset successful. You can now login with your new password.'
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updatePassword,
  createEmployee,
  getAllCustomers,
  forgotPassword,
  resetPassword,
};
