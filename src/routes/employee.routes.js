const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const employeeController = require('../controllers/employee.controller');

const router = express.Router();

// Employee Portal routes - must come BEFORE parameterized routes
router.get('/dashboard', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.getEmployeeDashboard);
router.get('/profile', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.getEmployeeProfile);
router.get('/attendance', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.getEmployeeAttendance);
router.post('/attendance/check-in', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.checkIn);
router.post('/attendance/check-out', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.checkOut);
router.get('/schedule', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.getEmployeeSchedule);
router.get('/leave', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.getEmployeeLeaveRequests);
router.post('/leave', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.createLeaveRequest);
router.delete('/leave/:id', authenticate, authorize('MANAGER', 'WAITER', 'CHEF'), employeeController.deleteLeaveRequest);

// Leave management routes (Admin/Manager only)
router.get('/leave/all', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getAllLeaveRequests);
router.put('/leave/:id', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.updateLeaveRequest);

// Admin routes - employee management
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getEmployeeStats);
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getAllEmployees);
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), employeeController.getEmployeeById);
router.post('/', authenticate, authorize('ADMIN'), employeeController.createEmployee);
router.put('/:id', authenticate, authorize('ADMIN'), employeeController.updateEmployee);
router.delete('/:id', authenticate, authorize('ADMIN'), employeeController.deleteEmployee);

module.exports = router;
