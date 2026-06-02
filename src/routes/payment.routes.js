const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();

// Get Stripe publishable key (PUBLIC - no authentication required)
// This needs to be public so the app can initialize Stripe before login
router.get('/config', paymentController.getPublishableKey);

// Create payment intent
router.post('/create-payment-intent', authenticate, paymentController.createPaymentIntent);

// Confirm payment and create order
router.post('/confirm', authenticate, paymentController.confirmPayment);

// Get payment status
router.get('/status/:paymentIntentId', authenticate, paymentController.getPaymentStatus);

// Get user's payment history
router.get('/history', authenticate, paymentController.getPaymentHistory);

// Request refund (admin only)
router.post('/refund/:paymentId', authenticate, authorize('ADMIN', 'MANAGER'), paymentController.requestRefund);

module.exports = router;
