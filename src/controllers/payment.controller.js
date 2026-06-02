/**
 * Payment Controller
 * Handles payment-related API requests
 */

const stripeService = require('../services/stripe.service');
const prisma = require('../config/database');

/**
 * Get Stripe publishable key
 */
exports.getPublishableKey = async (req, res) => {
  try {
    const publishableKey = stripeService.getPublishableKey();
    
    console.log('Publishable key requested');
    console.log('Key starts with:', publishableKey?.substring(0, 20));
    console.log('Key length:', publishableKey?.length);
    
    if (!publishableKey) {
      return res.status(500).json({
        error: 'Stripe publishable key not configured',
      });
    }

    res.json({ publishableKey });
  } catch (error) {
    console.error('Get publishable key error:', error);
    res.status(500).json({
      error: 'Failed to get publishable key',
    });
  }
};

/**
 * Create a payment intent
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount, orderId, orderType, items } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Valid amount is required',
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        error: 'Order items are required',
      });
    }

    // Create payment intent with metadata
    const paymentIntent = await stripeService.createPaymentIntent(
      amount,
      'lkr',
      {
        userId: req.user.userId.toString(),
        userEmail: req.user.email,
        orderType: orderType || 'DINE_IN',
        orderId: orderId || 'pending',
        itemCount: items.length.toString(),
      }
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);

    if (error.code === 'amount_too_small') {
      return res.status(400).json({
        error: 'Amount too small',
        code: error.code,
        message:
          'Your order total is below the Stripe minimum charge for LKR. Please add more items and try again.',
      });
    }

    res.status(500).json({
      error: 'Failed to create payment intent',
      message: error.message,
    });
  }
};

/**
 * Confirm payment and create order
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, orderData } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        error: 'Payment intent ID is required',
      });
    }

    if (!orderData || !orderData.items || orderData.items.length === 0) {
      return res.status(400).json({
        error: 'Order data is required',
      });
    }

    // Retrieve payment intent from Stripe to verify status
    const paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: 'Payment not completed',
        status: paymentIntent.status,
      });
    }

    // Calculate total from items
    const itemsWithDetails = await Promise.all(
      orderData.items.map(async (item) => {
        const menuItem = await prisma.menuItem.findUnique({
          where: { itemId: item.menuItemId },
        });

        if (!menuItem || !menuItem.isAvailable) {
          throw new Error(`Menu item ${item.menuItemId} is not available`);
        }

        return {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price: menuItem.price,
          specialInstructions: item.specialInstructions,
        };
      })
    );

    const totalPrice = itemsWithDetails.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Get customer profile for the authenticated user
    const customer = await prisma.customer.findUnique({
      where: { userId: req.user.userId },
    });

    if (!customer) {
      return res.status(400).json({
        error: 'Customer profile not found',
      });
    }

    // Create order with payment
    const order = await prisma.$transaction(async (tx) => {
      // Create the order
      const newOrder = await tx.order.create({
        data: {
          customerId: customer.customerId,
          type: orderData.type || 'DINE_IN',
          status: 'PENDING',
          totalAmount: totalPrice,
          items: {
            create: itemsWithDetails.map(item => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: item.price,
              customization: item.specialInstructions,
            })),
          },
        },
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
          customer: {
            include: {
              user: {
                select: {
                  userId: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      // Create payment record
      const payment = await tx.payment.create({
        data: {
          orderId: newOrder.orderId,
          amount: totalPrice,
          method: 'CREDIT_CARD',
          status: 'COMPLETED',
          transactionId: paymentIntentId,
        },
      });

      return { ...newOrder, payment };
    });

    res.json({
      success: true,
      order,
      message: 'Payment successful and order created',
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({
      error: 'Failed to process payment',
      message: error.message,
    });
  }
};

/**
 * Get payment status
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);

    res.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100, // Convert back from cents
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      error: 'Failed to get payment status',
      message: error.message,
    });
  }
};

/**
 * Get user's payment history
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        order: {
          userId: req.user.userId,
        },
      },
      include: {
        order: {
          select: {
            orderId: true,
            type: true,
            status: true,
            totalPrice: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(payments);
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      error: 'Failed to get payment history',
      message: error.message,
    });
  }
};

/**
 * Request refund (admin only)
 */
exports.requestRefund = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;

    // Get payment details
    const payment = await prisma.payment.findUnique({
      where: { paymentId: parseInt(paymentId) },
      include: {
        order: true,
      },
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
      });
    }

    if (payment.status !== 'COMPLETED') {
      return res.status(400).json({
        error: 'Can only refund completed payments',
      });
    }

    // Create refund in Stripe
    const refund = await stripeService.createRefund(
      payment.transactionId,
      amount // If amount provided, partial refund, otherwise full refund
    );

    // Update payment status
    const updatedPayment = await prisma.payment.update({
      where: { paymentId: parseInt(paymentId) },
      data: {
        status: amount && amount < payment.amount ? 'PARTIAL_REFUND' : 'REFUNDED',
      },
    });

    // Update order status
    await prisma.order.update({
      where: { orderId: payment.orderId },
      data: { status: 'CANCELLED' },
    });

    res.json({
      success: true,
      refund,
      payment: updatedPayment,
      message: 'Refund processed successfully',
    });
  } catch (error) {
    console.error('Request refund error:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      message: error.message,
    });
  }
};

module.exports = exports;
