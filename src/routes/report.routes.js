const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All report routes require admin/manager authorization
router.use(authenticate);
router.use(authorize('ADMIN', 'MANAGER'));

// Dashboard overview stats (legacy)
router.get('/dashboard', reportController.getDashboardStats);

// Comprehensive dashboard overview
router.get('/dashboard-overview', reportController.getDashboardOverview);

// Revenue report
router.get('/revenue', reportController.getRevenueReport);

// Sales report
router.get('/sales', reportController.getSalesReport);

// Customer insights
router.get('/customers', reportController.getCustomerInsights);

// Inventory report
router.get('/inventory', reportController.getInventoryReport);

// Employee performance
router.get('/employees', reportController.getEmployeePerformance);

// Order trends
router.get('/orders', reportController.getOrderTrends);

module.exports = router;
