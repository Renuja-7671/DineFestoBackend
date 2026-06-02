/**
 * Stripe Service
 * Handles all Stripe payment processing
 */

const Stripe = require('stripe');
const config = require('../config');

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

/**
 * Create a payment intent
 * @param {number} amount - Amount in cents (LKR)
 * @param {string} currency - Currency code (default: LKR)
 * @param {object} metadata - Additional data to attach
 */
exports.createPaymentIntent = async (amount, currency = 'lkr', metadata = {}) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return paymentIntent;
  } catch (error) {
    console.error('Stripe createPaymentIntent error:', error);
    const wrappedError = new Error(`Failed to create payment intent: ${error.message}`);
    wrappedError.code = error.code;
    wrappedError.statusCode = error.statusCode;
    wrappedError.type = error.type;
    throw wrappedError;
  }
};

/**
 * Retrieve a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 */
exports.retrievePaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Stripe retrievePaymentIntent error:', error);
    throw new Error(`Failed to retrieve payment intent: ${error.message}`);
  }
};

/**
 * Confirm a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 */
exports.confirmPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Stripe confirmPaymentIntent error:', error);
    throw new Error(`Failed to confirm payment intent: ${error.message}`);
  }
};

/**
 * Cancel a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 */
exports.cancelPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Stripe cancelPaymentIntent error:', error);
    throw new Error(`Failed to cancel payment intent: ${error.message}`);
  }
};

/**
 * Create a refund
 * @param {string} paymentIntentId - Payment intent ID to refund
 * @param {number} amount - Amount to refund in cents (optional, full refund if not provided)
 */
exports.createRefund = async (paymentIntentId, amount = null) => {
  try {
    const refundData = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to cents
    }

    const refund = await stripe.refunds.create(refundData);
    return refund;
  } catch (error) {
    console.error('Stripe createRefund error:', error);
    throw new Error(`Failed to create refund: ${error.message}`);
  }
};

/**
 * Get publishable key
 */
exports.getPublishableKey = () => {
  return process.env.STRIPE_PUBLISHABLE_KEY;
};

module.exports = exports;
