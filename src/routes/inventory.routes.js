const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const inventoryController = require('../controllers/inventory.controller');

const router = express.Router();

// All inventory routes require authentication and admin/manager role
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.getAllInventoryItems);
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.getInventoryStats);
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.getInventoryItemById);
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.createInventoryItem);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.updateInventoryItem);
router.put('/:id/adjust', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.adjustInventoryQuantity);
router.delete('/:id', authenticate, authorize('ADMIN'), inventoryController.deleteInventoryItem);

module.exports = router;
