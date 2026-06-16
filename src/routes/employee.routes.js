const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const employeeController = require('../controllers/employee.controller');

const router = express.Router();

// Employee Portal routes - must come BEFORE parameterized routes
router.get('/dashboard', authenticate, authorize('WAITER'), employeeController.getEmployeeDashboard);
router.get('/profile', authenticate, authorize('WAITER'), employeeController.getEmployeeProfile);
router.get('/attendance', authenticate, authorize('WAITER'), employeeController.getEmployeeAttendance);
router.post('/attendance/check-in', authenticate, authorize('WAITER'), employeeController.checkIn);
router.post('/attendance/check-out', authenticate, authorize('WAITER'), employeeController.checkOut);
router.get('/schedule', authenticate, authorize('WAITER'), employeeController.getEmployeeSchedule);
router.get('/leave/balance', authenticate, authorize('WAITER'), employeeController.getEmployeeLeaveBalance);
router.get('/leave/balances', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getAllEmployeeLeaveBalances);
router.get('/leave', authenticate, authorize('WAITER'), employeeController.getEmployeeLeaveRequests);
router.post('/leave', authenticate, authorize('WAITER'), employeeController.createLeaveRequest);
router.delete('/leave/:id', authenticate, authorize('WAITER'), employeeController.deleteLeaveRequest);

// Leave management routes (Admin/Manager only)
router.get('/leave/all', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getAllLeaveRequests);
router.put('/leave/:id', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.updateLeaveRequest);

// Admin routes - employee management
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getEmployeeStats);
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getAllEmployees);
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getEmployeeById);
router.post('/', authenticate, authorize('ADMIN'), employeeController.createEmployee);
router.put('/:id', authenticate, authorize('ADMIN'), employeeController.updateEmployee);
router.patch('/:id/status', authenticate, authorize('ADMIN'), employeeController.updateEmployeeStatus);

module.exports = router;
