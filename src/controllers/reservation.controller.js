const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripeService = require('../services/stripe.service');

const RESERVATION_AMOUNT_PER_GUEST = Number(process.env.RESERVATION_AMOUNT_PER_GUEST || 1000);
const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED'];

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const calculateReservationAmounts = guestCount => {
  const reservationAmount = roundMoney(guestCount * RESERVATION_AMOUNT_PER_GUEST);
  const onlinePaymentAmount = roundMoney(reservationAmount / 2);
  const remainingAmount = roundMoney(reservationAmount - onlinePaymentAmount);

  return {
    reservationAmount,
    onlinePaymentAmount,
    remainingAmount,
  };
};

const resolveCustomerId = async (req, customerIdFromBody) => {
  if (req.user.role === 'CUSTOMER') {
    if (!req.user.customerProfile || !req.user.customerProfile.customerId) {
      throw new Error('Customer profile not found');
    }

    return req.user.customerProfile.customerId;
  }

  return customerIdFromBody ? parseInt(customerIdFromBody) : null;
};

const findAvailableTableNumber = async (reservationDateTime, requestedTableNumber = null) => {
  const twoHoursBefore = new Date(reservationDateTime.getTime() - 2 * 60 * 60 * 1000);
  const twoHoursAfter = new Date(reservationDateTime.getTime() + 2 * 60 * 60 * 1000);

  const isTableAvailable = async tableNumber => {
    const existingReservation = await prisma.reservation.findFirst({
      where: {
        tableNumber,
        status: {
          in: ACTIVE_RESERVATION_STATUSES,
        },
        reservationTime: {
          gte: twoHoursBefore,
          lte: twoHoursAfter,
        },
      },
    });

    return !existingReservation;
  };

  if (requestedTableNumber) {
    const parsedTableNumber = parseInt(requestedTableNumber);
    if (await isTableAvailable(parsedTableNumber)) {
      return parsedTableNumber;
    }
  }

  for (let tableNumber = 1; tableNumber <= 20; tableNumber += 1) {
    if (await isTableAvailable(tableNumber)) {
      return tableNumber;
    }
  }

  throw new Error('No tables are available for the selected time slot');
};

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
    let { customerId, tableNumber, reservationTime, guestCount, numberOfGuests } = req.body;

    // Accept both guestCount (legacy) and numberOfGuests (current API)
    const guests = parseInt(numberOfGuests || guestCount);
    customerId = await resolveCustomerId(req, customerId);

    // Validate required fields
    if (!customerId || !reservationTime || !guests) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time and guest count are required',
      });
    }

    if (guests <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Guest count must be at least 1',
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

    const reservationDateTime = new Date(reservationTime);

    if (Number.isNaN(reservationDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation time',
      });
    }

    const assignedTableNumber = await findAvailableTableNumber(reservationDateTime, tableNumber);
    const { reservationAmount } = calculateReservationAmounts(guests);

    const reservation = await prisma.reservation.create({
      data: {
        customerId: parseInt(customerId),
        tableNumber: assignedTableNumber,
        reservationTime: reservationDateTime,
        guestCount: guests,
        status: 'PENDING', // Start as PENDING, admin can confirm
        reservationAmount,
        onlinePaidAmount: 0,
        remainingAmount: reservationAmount,
        paymentStatus: 'PENDING',
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

    if (error.message === 'No tables are available for the selected time slot') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === 'Customer profile not found') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create reservation',
      error: error.message,
    });
  }
};

exports.createReservationPaymentIntent = async (req, res) => {
  try {
    let { customerId, reservationTime, guestCount, numberOfGuests } = req.body;
    const guests = parseInt(numberOfGuests || guestCount);
    customerId = await resolveCustomerId(req, customerId);

    if (!customerId || !reservationTime || !guests) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time and guest count are required',
      });
    }

    if (guests <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Guest count must be at least 1',
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { customerId: parseInt(customerId) },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const reservationDateTime = new Date(reservationTime);

    if (Number.isNaN(reservationDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation time',
      });
    }

    // Validate that at least one table is available before accepting payment.
    await findAvailableTableNumber(reservationDateTime);

    const {
      reservationAmount,
      onlinePaymentAmount,
      remainingAmount,
    } = calculateReservationAmounts(guests);

    const paymentIntent = await stripeService.createPaymentIntent(
      onlinePaymentAmount,
      'lkr',
      {
        type: 'reservation_advance',
        customerId: String(customerId),
        guestCount: String(guests),
        reservationTime: reservationDateTime.toISOString(),
      }
    );

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        reservationAmount,
        onlinePaymentAmount,
        remainingAmount,
      },
    });
  } catch (error) {
    console.error('Error creating reservation payment intent:', error);

    if (error.code === 'amount_too_small') {
      return res.status(400).json({
        success: false,
        code: error.code,
        message:
          'Advance payment amount is below the Stripe minimum for LKR. Please increase guests or adjust the reservation amount policy.',
      });
    }

    if (
      error.message === 'No tables are available for the selected time slot' ||
      error.message === 'Customer profile not found'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to initialize reservation payment',
      error: error.message,
    });
  }
};

exports.confirmReservationWithPayment = async (req, res) => {
  try {
    const { paymentIntentId, reservationData } = req.body;
    let { customerId, tableNumber, reservationTime, guestCount, numberOfGuests } = reservationData || {};
    const guests = parseInt(numberOfGuests || guestCount);
    customerId = await resolveCustomerId(req, customerId);

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required',
      });
    }

    if (!customerId || !reservationTime || !guests) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time and guest count are required',
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { customerId: parseInt(customerId) },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment is not completed',
        status: paymentIntent.status,
      });
    }

    const reservationDateTime = new Date(reservationTime);
    if (Number.isNaN(reservationDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation time',
      });
    }

    const {
      reservationAmount,
      onlinePaymentAmount,
      remainingAmount,
    } = calculateReservationAmounts(guests);

    if (Math.round(onlinePaymentAmount * 100) !== paymentIntent.amount) {
      return res.status(400).json({
        success: false,
        message: 'Paid amount does not match required reservation advance payment',
      });
    }

    const assignedTableNumber = await findAvailableTableNumber(reservationDateTime, tableNumber);

    const reservation = await prisma.reservation.create({
      data: {
        customerId: parseInt(customerId),
        tableNumber: assignedTableNumber,
        reservationTime: reservationDateTime,
        guestCount: guests,
        status: 'PENDING',
        reservationAmount,
        onlinePaidAmount: onlinePaymentAmount,
        remainingAmount,
        paymentStatus: 'PARTIAL',
        paymentTransactionId: paymentIntentId,
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
      message: 'Reservation created with advance payment',
      data: reservation,
    });
  } catch (error) {
    console.error('Error confirming reservation with payment:', error);

    if (
      error.message === 'No tables are available for the selected time slot' ||
      error.message === 'Customer profile not found'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to confirm reservation payment',
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
