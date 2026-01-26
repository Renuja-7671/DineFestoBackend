const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// Get all employees
exports.getAllEmployees = async (req, res) => {
  try {
    const { role } = req.query;
    
    const where = {
      role: { not: 'CUSTOMER' },
    };
    
    if (role) {
      where.role = role;
    }

    const employees = await prisma.user.findMany({
      where,
      include: {
        employeeProfile: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Flatten and sanitize employee data for frontend
    const sanitizedEmployees = employees.map(emp => {
      const { passwordHash, employeeProfile, ...rest } = emp;
      return {
        ...rest,
        id: emp.userId, // Use userId as id for consistency
        fullName: employeeProfile?.fullName || 'N/A',
        contact: employeeProfile?.contact || null,
        phoneNumber: employeeProfile?.contact || null, // Alias for backward compatibility
        position: employeeProfile?.designation || 'N/A',
        designation: employeeProfile?.designation || 'N/A',
        salary: employeeProfile?.salary || 0,
        joinDate: employeeProfile?.joinDate || null,
        employeeId: employeeProfile?.employeeId || null,
        // Keep the nested structure for backward compatibility
        employee: employeeProfile ? {
          position: employeeProfile.designation,
          designation: employeeProfile.designation,
          salary: employeeProfile.salary,
          fullName: employeeProfile.fullName,
          contact: employeeProfile.contact,
          phoneNumber: employeeProfile.contact,
          joinDate: employeeProfile.joinDate,
        } : null,
      };
    });

    res.json({
      success: true,
      data: sanitizedEmployees,
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees',
      error: error.message,
    });
  }
};

// Get single employee by ID
exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await prisma.user.findUnique({
      where: { userId: parseInt(id) },
      include: {
        employeeProfile: true,
      },
    });

    if (!employee || employee.role === 'CUSTOMER') {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Flatten and remove password hash
    const { passwordHash, employeeProfile, ...rest } = employee;
    const sanitizedEmployee = {
      ...rest,
      id: employee.userId,
      fullName: employeeProfile?.fullName || 'N/A',
      contact: employeeProfile?.contact || null,
      phoneNumber: employeeProfile?.contact || null,
      position: employeeProfile?.designation || 'N/A',
      designation: employeeProfile?.designation || 'N/A',
      salary: employeeProfile?.salary || 0,
      joinDate: employeeProfile?.joinDate || null,
      employeeId: employeeProfile?.employeeId || null,
      employee: employeeProfile ? {
        position: employeeProfile.designation,
        designation: employeeProfile.designation,
        salary: employeeProfile.salary,
        fullName: employeeProfile.fullName,
        contact: employeeProfile.contact,
        phoneNumber: employeeProfile.contact,
        joinDate: employeeProfile.joinDate,
      } : null,
    };

    res.json({
      success: true,
      data: sanitizedEmployee,
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee',
      error: error.message,
    });
  }
};

// Create new employee
exports.createEmployee = async (req, res) => {
  try {
    const { email, password, role, fullName, designation, salary, phoneNumber, contact } = req.body;

    // Validate required fields
    if (!email || !password || !role || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, role, and full name are required',
      });
    }

    // Validate role
    const validRoles = ['ADMIN', 'MANAGER', 'WAITER', 'CHEF'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be ADMIN, MANAGER, WAITER, or CHEF',
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create employee with profile
    const employee = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        employeeProfile: {
          create: {
            fullName,
            contact: contact || phoneNumber || null,
            designation: designation || role,
            salary: salary ? parseFloat(salary) : 0,
          },
        },
      },
      include: {
        employeeProfile: true,
      },
    });

    // Flatten and remove password hash
    const { passwordHash: _, employeeProfile, ...rest } = employee;
    const sanitizedEmployee = {
      ...rest,
      id: employee.userId,
      fullName: employeeProfile?.fullName || 'N/A',
      contact: employeeProfile?.contact || null,
      phoneNumber: employeeProfile?.contact || null,
      position: employeeProfile?.designation || 'N/A',
      designation: employeeProfile?.designation || 'N/A',
      salary: employeeProfile?.salary || 0,
      joinDate: employeeProfile?.joinDate || null,
      employee: employeeProfile ? {
        position: employeeProfile.designation,
        designation: employeeProfile.designation,
        salary: employeeProfile.salary,
        fullName: employeeProfile.fullName,
        contact: employeeProfile.contact,
        phoneNumber: employeeProfile.contact,
        joinDate: employeeProfile.joinDate,
      } : null,
    };

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: sanitizedEmployee,
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create employee',
      error: error.message,
    });
  }
};

// Update employee
exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, role, fullName, designation, salary, phoneNumber, contact } = req.body;

    // Check if employee exists
    const existingEmployee = await prisma.user.findUnique({
      where: { userId: parseInt(id) },
      include: { employeeProfile: true },
    });

    if (!existingEmployee || existingEmployee.role === 'CUSTOMER') {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== existingEmployee.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists',
        });
      }
    }

    // Prepare user update data
    const userUpdateData = {};
    if (email !== undefined) userUpdateData.email = email;
    if (role !== undefined) userUpdateData.role = role;
    if (password) {
      userUpdateData.passwordHash = await bcrypt.hash(password, 10);
    }

    // Prepare employee profile update data
    const profileUpdateData = {};
    if (fullName !== undefined) profileUpdateData.fullName = fullName;
    if (designation !== undefined) profileUpdateData.designation = designation;
    if (salary !== undefined) profileUpdateData.salary = parseFloat(salary);
    if (contact !== undefined) profileUpdateData.contact = contact;
    if (phoneNumber !== undefined) profileUpdateData.contact = phoneNumber;

    // Update employee
    const employee = await prisma.user.update({
      where: { userId: parseInt(id) },
      data: {
        ...userUpdateData,
        employeeProfile: {
          update: profileUpdateData,
        },
      },
      include: {
        employeeProfile: true,
      },
    });

    // Flatten and remove password hash
    const { passwordHash: _, employeeProfile, ...rest } = employee;
    const sanitizedEmployee = {
      ...rest,
      id: employee.userId,
      fullName: employeeProfile?.fullName || 'N/A',
      contact: employeeProfile?.contact || null,
      phoneNumber: employeeProfile?.contact || null,
      position: employeeProfile?.designation || 'N/A',
      designation: employeeProfile?.designation || 'N/A',
      salary: employeeProfile?.salary || 0,
      joinDate: employeeProfile?.joinDate || null,
      employee: employeeProfile ? {
        position: employeeProfile.designation,
        designation: employeeProfile.designation,
        salary: employeeProfile.salary,
        fullName: employeeProfile.fullName,
        contact: employeeProfile.contact,
        phoneNumber: employeeProfile.contact,
        joinDate: employeeProfile.joinDate,
      } : null,
    };

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: sanitizedEmployee,
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update employee',
      error: error.message,
    });
  }
};

// Delete employee
exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if employee exists
    const existingEmployee = await prisma.user.findUnique({
      where: { userId: parseInt(id) },
    });

    if (!existingEmployee || existingEmployee.role === 'CUSTOMER') {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Prevent deleting yourself (the authenticated admin)
    if (req.user && req.user.userId === parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    // Delete employee profile first, then user
    if (existingEmployee.role !== 'CUSTOMER') {
      await prisma.employeeProfile.deleteMany({
        where: { userId: parseInt(id) },
      });
    }

    await prisma.user.delete({
      where: { userId: parseInt(id) },
    });

    res.json({
      success: true,
      message: 'Employee deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete employee',
      error: error.message,
    });
  }
};

// Get employee statistics
exports.getEmployeeStats = async (req, res) => {
  try {
    const totalEmployees = await prisma.user.count({
      where: { role: { not: 'CUSTOMER' } },
    });

    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    const managerCount = await prisma.user.count({ where: { role: 'MANAGER' } });
    const waiterCount = await prisma.user.count({ where: { role: 'WAITER' } });
    const chefCount = await prisma.user.count({ where: { role: 'CHEF' } });

    res.json({
      success: true,
      data: {
        totalEmployees,
        byRole: {
          admin: adminCount,
          manager: managerCount,
          waiter: waiterCount,
          chef: chefCount,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching employee stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee statistics',
      error: error.message,
    });
  }
};

// ==================== EMPLOYEE PORTAL ENDPOINTS ====================

// Get employee dashboard data
exports.getEmployeeDashboard = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get employee profile with stats
    const employee = await prisma.user.findUnique({
      where: { userId },
      include: {
        employeeProfile: true,
      },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's orders processed by this employee
    const todayOrders = await prisma.order.findMany({
      where: {
        staffId: employeeId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const ordersProcessed = todayOrders.length;
    const completedOrders = todayOrders.filter(o => ['SERVED', 'COMPLETED'].includes(o.status)).length;
    const pendingOrders = todayOrders.filter(o => ['PENDING', 'PREPARING', 'READY'].includes(o.status)).length;
    const revenue = todayOrders
      .filter(o => ['SERVED', 'COMPLETED'].includes(o.status))
      .reduce((sum, order) => sum + parseFloat(order.totalAmount), 0);

    // Get today's attendance
    const todayAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId: employeeId,
        date: today,
      },
    });

    let workingHours = 0;
    if (todayAttendance && todayAttendance.checkInTime) {
      const checkIn = new Date(todayAttendance.checkInTime);
      const checkOut = todayAttendance.checkOutTime ? new Date(todayAttendance.checkOutTime) : new Date();
      workingHours = (checkOut - checkIn) / (1000 * 60 * 60); // Convert to hours
    }

    // Get upcoming leave
    const upcomingLeave = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: employeeId,
        status: 'APPROVED',
        startDate: {
          gte: new Date(),
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    // Get recent activity (recent orders)
    const recentActivity = todayOrders.slice(0, 5).map(order => ({
      icon: '📦',
      title: `Order #${order.orderId}`,
      description: `${order.type} - ${order.status}`,
      time: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }));

    res.json({
      success: true,
      data: {
        todayStats: {
          ordersProcessed,
          revenue,
          completedOrders,
          pendingOrders,
        },
        attendanceStatus: {
          checkedIn: todayAttendance && todayAttendance.checkInTime && !todayAttendance.checkOutTime,
          checkInTime: todayAttendance?.checkInTime,
          workingHours,
        },
        recentActivity,
        upcomingLeave,
      },
    });
  } catch (error) {
    console.error('Error fetching employee dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message,
    });
  }
};

// Get employee profile
exports.getEmployeeProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const employee = await prisma.user.findUnique({
      where: { userId },
      include: {
        employeeProfile: true,
      },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;

    // Get statistics
    const totalOrders = await prisma.order.count({
      where: { staffId: employeeId },
    });

    const completedOrders = await prisma.order.findMany({
      where: {
        staffId: employeeId,
        status: { in: ['SERVED', 'COMPLETED'] },
      },
    });

    const revenueGenerated = completedOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount), 0);

    // Get working days (attendance present days)
    const workingDays = await prisma.attendance.count({
      where: {
        employeeId: employeeId,
        status: { in: ['PRESENT', 'LATE'] },
      },
    });

    // Calculate performance score (simplified)
    const performanceScore = totalOrders > 0 ? Math.min(100, Math.round((completedOrders.length / totalOrders) * 100)) : 0;

    // Get recent orders
    const recentOrders = await prisma.order.findMany({
      where: { staffId: employeeId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const { passwordHash, ...userData } = employee;
    const profileData = {
      ...userData,
      ...employee.employeeProfile,
      stats: {
        ordersProcessed: totalOrders,
        revenueGenerated,
        workingDays,
        performanceScore,
      },
      recentOrders: recentOrders.map(order => ({
        orderId: order.orderId,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
      })),
    };

    res.json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    console.error('Error fetching employee profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message,
    });
  }
};

// Get employee attendance
exports.getEmployeeAttendance = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const employee = await prisma.user.findUnique({
      where: { userId },
      include: { employeeProfile: true },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;

    // Get today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId: employeeId,
        date: today,
      },
    });

    // Get attendance history (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const attendanceHistory = await prisma.attendance.findMany({
      where: {
        employeeId: employeeId,
        date: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Calculate stats
    const presentDays = attendanceHistory.filter(a => a.status === 'PRESENT').length;
    const absentDays = attendanceHistory.filter(a => a.status === 'ABSENT').length;
    const lateDays = attendanceHistory.filter(a => a.status === 'LATE').length;
    
    let totalWorkingHours = 0;
    attendanceHistory.forEach(record => {
      if (record.checkInTime && record.checkOutTime) {
        const checkIn = new Date(record.checkInTime);
        const checkOut = new Date(record.checkOutTime);
        totalWorkingHours += (checkOut - checkIn) / (1000 * 60 * 60);
      }
    });

    res.json({
      success: true,
      data: {
        todayAttendance,
        attendanceHistory,
        stats: {
          presentDays,
          absentDays,
          lateDays,
          totalWorkingHours: Math.round(totalWorkingHours * 10) / 10,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance',
      error: error.message,
    });
  }
};

// Check in
exports.checkIn = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const employee = await prisma.user.findUnique({
      where: { userId },
      include: { employeeProfile: true },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId: employeeId,
        date: today,
      },
    });

    if (existingAttendance && existingAttendance.checkInTime) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in today',
      });
    }

    // Determine status based on time
    // Shop hours: 6:00 AM - 10:00 PM
    const now = new Date();
    const expectedCheckInTime = new Date(today);
    expectedCheckInTime.setHours(6, 0, 0, 0); // Shop opens at 6 AM
    
    // Determine which shift the employee should be on
    const currentHour = now.getHours();
    let shiftStartHour = 6;
    
    // Morning shift: 6 AM - 2 PM
    // Afternoon shift: 2 PM - 10 PM
    if (currentHour >= 14) {
      shiftStartHour = 14; // 2 PM
    }
    
    const shiftStartTime = new Date(today);
    shiftStartTime.setHours(shiftStartHour, 0, 0, 0);
    
    // Allow 15-minute grace period for check-in
    const lateThreshold = new Date(shiftStartTime);
    lateThreshold.setMinutes(15);
    
    const status = now > lateThreshold ? 'LATE' : 'PRESENT';

    const attendance = existingAttendance
      ? await prisma.attendance.update({
          where: { attendanceId: existingAttendance.attendanceId },
          data: {
            checkInTime: now,
            status,
          },
        })
      : await prisma.attendance.create({
          data: {
            employeeId: employeeId,
            date: today,
            checkInTime: now,
            status,
          },
        });

    res.json({
      success: true,
      message: 'Checked in successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Error checking in:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check in',
      error: error.message,
    });
  }
};

// Check out
exports.checkOut = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const employee = await prisma.user.findUnique({
      where: { userId },
      include: { employeeProfile: true },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: {
        employeeId: employeeId,
        date: today,
      },
    });

    if (!attendance || !attendance.checkInTime) {
      return res.status(400).json({
        success: false,
        message: 'Not checked in today',
      });
    }

    if (attendance.checkOutTime) {
      return res.status(400).json({
        success: false,
        message: 'Already checked out today',
      });
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { attendanceId: attendance.attendanceId },
      data: {
        checkOutTime: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Checked out successfully',
      data: updatedAttendance,
    });
  } catch (error) {
    console.error('Error checking out:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check out',
      error: error.message,
    });
  }
};

// Get employee schedule
exports.getEmployeeSchedule = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const employee = await prisma.user.findUnique({
      where: { userId },
      include: { employeeProfile: true },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    // For now, return mock schedule data
    // In a real application, you'd have a Schedule model
    // Shop hours: 6:00 AM - 10:00 PM (16 hours daily)
    // Two shifts: Morning (6 AM - 2 PM) and Afternoon (2 PM - 10 PM)
    const today = new Date();
    const thisWeekSchedule = [];
    const nextWeekSchedule = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      
      // Alternate between Morning and Afternoon shifts
      const shift = i % 2 === 0 ? 'Morning' : 'Afternoon';
      const startHour = shift === 'Morning' ? 6 : 14; // 6 AM or 2 PM
      const endHour = shift === 'Morning' ? 14 : 22; // 2 PM or 10 PM
      
      const startTime = new Date(date);
      startTime.setHours(startHour, 0, 0, 0);
      
      const endTime = new Date(date);
      endTime.setHours(endHour, 0, 0, 0);
      
      const scheduleItem = {
        date: date,
        shift,
        startTime,
        endTime,
        duration: 8,
        isToday: i === 0,
      };
      
      thisWeekSchedule.push(scheduleItem);
    }
    
    for (let i = 7; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      
      // Alternate between Morning and Afternoon shifts
      const shift = i % 2 === 0 ? 'Morning' : 'Afternoon';
      const startHour = shift === 'Morning' ? 6 : 14; // 6 AM or 2 PM
      const endHour = shift === 'Morning' ? 14 : 22; // 2 PM or 10 PM
      
      const startTime = new Date(date);
      startTime.setHours(startHour, 0, 0, 0);
      
      const endTime = new Date(date);
      endTime.setHours(endHour, 0, 0, 0);
      
      nextWeekSchedule.push({
        date,
        shift,
        startTime,
        endTime,
        duration: 8,
      });
    }

    res.json({
      success: true,
      data: {
        thisWeekSchedule,
        nextWeekSchedule,
        upcomingShift: thisWeekSchedule[0],
      },
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schedule',
      error: error.message,
    });
  }
};

// Get employee leave requests
exports.getEmployeeLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const employee = await prisma.user.findUnique({
      where: { userId },
      include: { employeeProfile: true },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: { employeeId: employeeId },
      orderBy: { appliedAt: 'desc' },
    });

    res.json({
      success: true,
      data: leaveRequests,
    });
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave requests',
      error: error.message,
    });
  }
};

// Create leave request
exports.createLeaveRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Start date, end date, and reason are required',
      });
    }

    const employee = await prisma.user.findUnique({
      where: { userId },
      include: { employeeProfile: true },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        employeeId: employeeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        status: 'PENDING',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      data: leaveRequest,
    });
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create leave request',
      error: error.message,
    });
  }
};

// Get all leave requests (Admin/Manager only)
exports.getAllLeaveRequests = async (req, res) => {
  try {
    const leaveRequests = await prisma.leaveRequest.findMany({
      include: {
        employee: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        appliedAt: 'desc',
      },
    });

    // Format the response to include employee details
    const formattedRequests = leaveRequests.map(request => ({
      ...request,
      employee: {
        fullName: request.employee.fullName,
        email: request.employee.user.email,
        designation: request.employee.designation,
      },
    }));

    res.json({
      success: true,
      data: formattedRequests,
    });
  } catch (error) {
    console.error('Error fetching all leave requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave requests',
      error: error.message,
    });
  }
};

// Update leave request status (Admin/Manager only)
exports.updateLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;

    if (!status || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (APPROVED, REJECTED, or PENDING) is required',
      });
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { leaveId: parseInt(id) },
      include: {
        employee: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    const updatedRequest = await prisma.leaveRequest.update({
      where: { leaveId: parseInt(id) },
      data: {
        status,
        adminComment: adminComment || leaveRequest.adminComment,
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully`,
      data: updatedRequest,
    });
  } catch (error) {
    console.error('Error updating leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update leave request',
      error: error.message,
    });
  }
};

// Delete leave request (Employee can only delete their own PENDING requests)
exports.deleteLeaveRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const employee = await prisma.user.findUnique({
      where: { userId },
      include: { employeeProfile: true },
    });

    if (!employee || !employee.employeeProfile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found',
      });
    }

    const employeeId = employee.employeeProfile.employeeId;

    // Find the leave request
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { leaveId: parseInt(id) },
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    // Check if the leave request belongs to the employee
    if (leaveRequest.employeeId !== employeeId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this leave request',
      });
    }

    // Check if the leave request is still pending
    if (leaveRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete ${leaveRequest.status.toLowerCase()} leave request. Only pending requests can be deleted.`,
      });
    }

    // Delete the leave request
    await prisma.leaveRequest.delete({
      where: { leaveId: parseInt(id) },
    });

    res.json({
      success: true,
      message: 'Leave request deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting leave request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete leave request',
      error: error.message,
    });
  }
};
