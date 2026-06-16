const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const employeeController = require('../controllers/employee.controller');

const router = express.Router();

router.use(authenticate, authorize('CHEF'));

router.get('/profile', employeeController.getEmployeeProfile);
router.get('/leave', employeeController.getEmployeeLeaveRequests);
router.get('/leave/balance', employeeController.getEmployeeLeaveBalance);
router.post('/leave', employeeController.createLeaveRequest);
router.delete('/leave/:id', employeeController.deleteLeaveRequest);

module.exports = router;
