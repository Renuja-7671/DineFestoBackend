const express = require('express');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth.middleware');
const menuController = require('../controllers/menu.controller');

const router = express.Router();

// Public routes (no authentication required)
router.get('/', optionalAuth, menuController.getAllMenuItems);
router.get('/categories', optionalAuth, menuController.getAllCategories);
router.get('/:id', optionalAuth, menuController.getMenuItemById);

// Admin/Manager only routes
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), menuController.createMenuItem);
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), menuController.updateMenuItem);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), menuController.deleteMenuItem);
router.post('/categories', authenticate, authorize('ADMIN', 'MANAGER'), menuController.createCategory);

module.exports = router;
