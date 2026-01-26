const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all reservations
exports.getAllReservations = async (req, res) => {
  try {
    const { status, date, customerId } = req.query;
    
    const where = {};
    if (status) where.status = status;
    
    // If user is a CUSTOMER, only show their own reservations
    // If user is ADMIN/MANAGER, they can see all or filter by customerId
    if (req.user.role === 'CUSTOMER') {
      if (req.user.customerProfile && req.user.customerProfile.customerId) {
        where.customerId = req.user.customerProfile.customerId;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Customer profile not found',
        });
      }
    } else if (customerId) {
      // Admin/Manager can filter by specific customer
      where.customerId = parseInt(customerId);
    }
    
    // Filter by date (reservations on specific date)
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      where.reservationTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        reservationTime: 'desc',
      },
    });

    res.json({
      success: true,
      data: reservations,
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reservations',
      error: error.message,
    });
  }
};

// Get single reservation by ID
exports.getReservationById = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id) },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    // If user is a CUSTOMER, only allow viewing their own reservations
    if (req.user.role === 'CUSTOMER') {
      if (!req.user.customerProfile || 
          req.user.customerProfile.customerId !== reservation.customerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own reservations.',
        });
      }
    }

    res.json({
      success: true,
      data: reservation,
    });
  } catch (error) {
    console.error('Error fetching reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reservation',
      error: error.message,
    });
  }
};

// Create new reservation
exports.createReservation = async (req, res) => {
  try {
    let { customerId, tableNumber, reservationTime, guestCount, numberOfGuests, specialRequests } = req.body;

    // Accept both guestCount (legacy) and numberOfGuests (current API)
    const guests = numberOfGuests || guestCount;

    // If user is a CUSTOMER, use their customerId (ignore any customerId in body)
    if (req.user.role === 'CUSTOMER') {
      if (!req.user.customerProfile || !req.user.customerProfile.customerId) {
        return res.status(400).json({
          success: false,
          message: 'Customer profile not found',
        });
      }
      customerId = req.user.customerProfile.customerId;
    }

    // Validate required fields
    if (!customerId || !reservationTime || !guests) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time and guest count are required',
      });
    }

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { customerId: parseInt(customerId) },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    // Auto-assign table if not provided (for customers)
    // Admins can manually specify a table
    if (!tableNumber) {
      // Simple auto-assignment: find first available table
      // In a real system, this would be more sophisticated
      tableNumber = Math.floor(Math.random() * 20) + 1; // Tables 1-20
    }

    // Check if table is already reserved at that time (within 2 hours window)
    const reservationDateTime = new Date(reservationTime);
    const twoHoursBefore = new Date(reservationDateTime.getTime() - 2 * 60 * 60 * 1000);
    const twoHoursAfter = new Date(reservationDateTime.getTime() + 2 * 60 * 60 * 1000);

    const existingReservation = await prisma.reservation.findFirst({
      where: {
        tableNumber: parseInt(tableNumber),
        status: {
          in: ['PENDING', 'CONFIRMED', 'SEATED'],
        },
        reservationTime: {
          gte: twoHoursBefore,
          lte: twoHoursAfter,
        },
      },
    });

    if (existingReservation) {
      // Try to find another available table
      for (let i = 1; i <= 20; i++) {
        const tableCheck = await prisma.reservation.findFirst({
          where: {
            tableNumber: i,
            status: {
              in: ['PENDING', 'CONFIRMED', 'SEATED'],
            },
            reservationTime: {
              gte: twoHoursBefore,
              lte: twoHoursAfter,
            },
          },
        });
        if (!tableCheck) {
          tableNumber = i;
          break;
        }
      }
    }

    const reservation = await prisma.reservation.create({
      data: {
        customerId: parseInt(customerId),
        tableNumber: parseInt(tableNumber),
        reservationTime: new Date(reservationTime),
        guestCount: parseInt(guests),
        status: 'PENDING', // Start as PENDING, admin can confirm
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      data: reservation,
    });
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create reservation',
      error: error.message,
    });
  }
};

// Update reservation
exports.updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { tableNumber, reservationTime, guestCount, status } = req.body;

    // Check if reservation exists
    const existingReservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    // If updating table or time, check for conflicts
    if (tableNumber || reservationTime) {
      const newTableNumber = tableNumber ? parseInt(tableNumber) : existingReservation.tableNumber;
      const newReservationTime = reservationTime ? new Date(reservationTime) : existingReservation.reservationTime;
      
      const twoHoursBefore = new Date(newReservationTime.getTime() - 2 * 60 * 60 * 1000);
      const twoHoursAfter = new Date(newReservationTime.getTime() + 2 * 60 * 60 * 1000);

      const conflictingReservation = await prisma.reservation.findFirst({
        where: {
          reservationId: { not: parseInt(id) },
          tableNumber: newTableNumber,
          status: 'CONFIRMED',
          reservationTime: {
            gte: twoHoursBefore,
            lte: twoHoursAfter,
          },
        },
      });

      if (conflictingReservation) {
        return res.status(400).json({
          success: false,
          message: 'Table is already reserved for this time slot',
        });
      }
    }

    const updateData = {};
    if (tableNumber !== undefined) updateData.tableNumber = parseInt(tableNumber);
    if (reservationTime !== undefined) updateData.reservationTime = new Date(reservationTime);
    if (guestCount !== undefined) updateData.guestCount = parseInt(guestCount);
    if (status !== undefined) updateData.status = status;

    const reservation = await prisma.reservation.update({
      where: { reservationId: parseInt(id) },
      data: updateData,
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: 'Reservation updated successfully',
      data: reservation,
    });
  } catch (error) {
    console.error('Error updating reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update reservation',
      error: error.message,
    });
  }
};

// Cancel reservation
exports.cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const existingReservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    // If user is a CUSTOMER, only allow canceling their own reservations
    if (req.user.role === 'CUSTOMER') {
      if (!req.user.customerProfile || 
          req.user.customerProfile.customerId !== existingReservation.customerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only cancel your own reservations.',
        });
      }
    }

    const reservation = await prisma.reservation.update({
      where: { reservationId: parseInt(id) },
      data: { status: 'CANCELLED' },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: 'Reservation cancelled successfully',
      data: reservation,
    });
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel reservation',
      error: error.message,
    });
  }
};

// Delete reservation
exports.deleteReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const existingReservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    await prisma.reservation.delete({
      where: { reservationId: parseInt(id) },
    });

    res.json({
      success: true,
      message: 'Reservation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete reservation',
      error: error.message,
    });
  }
};

// Get reservation statistics
exports.getReservationStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalReservations = await prisma.reservation.count();
    
    const todayReservations = await prisma.reservation.count({
      where: {
        reservationTime: {
          gte: today,
          lt: tomorrow,
        },
        status: 'CONFIRMED',
      },
    });

    const upcomingReservations = await prisma.reservation.count({
      where: {
        reservationTime: {
          gte: new Date(),
        },
        status: 'CONFIRMED',
      },
    });

    const cancelledReservations = await prisma.reservation.count({
      where: { status: 'CANCELLED' },
    });

    res.json({
      success: true,
      data: {
        totalReservations,
        todayReservations,
        upcomingReservations,
        cancelledReservations,
      },
    });
  } catch (error) {
    console.error('Error fetching reservation stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reservation statistics',
      error: error.message,
    });
  }
};

// Get available tables for a specific time
exports.getAvailableTables = async (req, res) => {
  try {
    const { reservationTime } = req.query;

    if (!reservationTime) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time is required',
      });
    }

    const requestedTime = new Date(reservationTime);
    const twoHoursBefore = new Date(requestedTime.getTime() - 2 * 60 * 60 * 1000);
    const twoHoursAfter = new Date(requestedTime.getTime() + 2 * 60 * 60 * 1000);

    // Get all reserved tables for this time window
    const reservedTables = await prisma.reservation.findMany({
      where: {
        status: 'CONFIRMED',
        reservationTime: {
          gte: twoHoursBefore,
          lte: twoHoursAfter,
        },
      },
      select: {
        tableNumber: true,
      },
    });

    const reservedTableNumbers = reservedTables.map(r => r.tableNumber);
    
    // Assuming tables 1-20 exist (you can modify this based on your setup)
    const totalTables = 20;
    const availableTables = [];
    
    for (let i = 1; i <= totalTables; i++) {
      if (!reservedTableNumbers.includes(i)) {
        availableTables.push(i);
      }
    }

    res.json({
      success: true,
      data: {
        availableTables,
        reservedTables: reservedTableNumbers,
      },
    });
  } catch (error) {
    console.error('Error fetching available tables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available tables',
      error: error.message,
    });
  }
};
