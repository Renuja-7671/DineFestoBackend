const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number is required'),
  validate,
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

const updatePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate,
];

const createEmployeeValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phoneNumber').optional().matches(/^[0-9+\-() ]{7,20}$/).withMessage('Invalid phone number format'),
  body('designation').trim().notEmpty().withMessage('Designation is required'),
  body('salary').isNumeric().withMessage('Valid salary is required'),
  body('role').isIn(['WAITER', 'CHEF']).withMessage('Invalid role'),
  validate,
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  validate,
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate,
];

// Public routes
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.post('/forgot-password', forgotPasswordValidation, authController.forgotPassword);
router.post('/reset-password', resetPasswordValidation, authController.resetPassword);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.put('/password', authenticate, updatePasswordValidation, authController.updatePassword);

// Admin only routes
router.post('/employee', authenticate, authorize('ADMIN'), createEmployeeValidation, authController.createEmployee);
router.get('/customers', authenticate, authorize('ADMIN', 'MANAGER', 'WAITER'), authController.getAllCustomers);

module.exports = router;
