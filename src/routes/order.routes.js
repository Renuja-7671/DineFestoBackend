const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const orderController = require('../controllers/order.controller');

const router = express.Router();

// All order routes require authentication
router.get('/', authenticate, orderController.getAllOrders);
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), orderController.getOrderStats);
router.get('/:id', authenticate, orderController.getOrderById);
router.post('/', authenticate, orderController.createOrder);
router.patch('/:id/attend', authenticate, authorize('WAITER'), orderController.attendOrder);
router.put('/:id/cancel', authenticate, orderController.cancelOrder);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'WAITER'), orderController.updateOrder);
router.put('/:id/status', authenticate, authorize('ADMIN', 'MANAGER', 'WAITER', 'CHEF'), orderController.updateOrderStatus);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), orderController.deleteOrder);

module.exports = router;
