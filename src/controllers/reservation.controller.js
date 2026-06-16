const prisma = require('../config/database');
const stripeService = require('../services/stripe.service');
const {
  TOTAL_TABLES,
  MAX_GUESTS_PER_TABLE,
  RESERVATION_AMOUNT_PER_GUEST,
  ACTIVE_RESERVATION_STATUSES,
  DURATION_OPTIONS_MINUTES,
} = require('../constants/reservation.constants');

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

const getReservationEndTime = (startTime, durationMinutes) =>
  new Date(startTime.getTime() + durationMinutes * 60 * 1000);

const reservationsOverlap = (startA, durationA, startB, durationB) => {
  const endA = getReservationEndTime(startA, durationA);
  const endB = getReservationEndTime(startB, durationB);
  return startA < endB && startB < endA;
};

const validateGuestCount = guestCount => {
  const guests = parseInt(guestCount, 10);
  if (Number.isNaN(guests) || guests < 1) {
    return { valid: false, message: 'Guest count must be at least 1' };
  }
  if (guests > MAX_GUESTS_PER_TABLE) {
    return {
      valid: false,
      message: `Maximum ${MAX_GUESTS_PER_TABLE} guests per table. Please reduce party size or book multiple tables separately.`,
    };
  }
  return { valid: true, guests };
};

const validateDuration = durationMinutes => {
  const duration = parseInt(durationMinutes, 10);
  if (Number.isNaN(duration) || !DURATION_OPTIONS_MINUTES.includes(duration)) {
    return {
      valid: false,
      message: `Duration must be one of: ${DURATION_OPTIONS_MINUTES.map(m => `${m / 60}h`).join(', ')}`,
    };
  }
  return { valid: true, duration };
};

const validateTableNumber = tableNumber => {
  const table = parseInt(tableNumber, 10);
  if (Number.isNaN(table) || table < 1 || table > TOTAL_TABLES) {
    return {
      valid: false,
      message: `Table number must be between 1 and ${TOTAL_TABLES}`,
    };
  }
  return { valid: true, table };
};

const getOverlappingReservations = async (reservationDateTime, durationMinutes, excludeReservationId = null) => {
  const dayStart = new Date(reservationDateTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(reservationDateTime);
  dayEnd.setHours(23, 59, 59, 999);

  const where = {
    status: { in: ACTIVE_RESERVATION_STATUSES },
    reservationTime: { gte: dayStart, lte: dayEnd },
  };

  if (excludeReservationId) {
    where.reservationId = { not: excludeReservationId };
  }

  return prisma.reservation.findMany({ where });
};

const isTableAvailable = async (tableNumber, reservationDateTime, durationMinutes, excludeReservationId = null) => {
  const overlapping = await getOverlappingReservations(
    reservationDateTime,
    durationMinutes,
    excludeReservationId
  );

  return !overlapping.some(existing =>
    existing.tableNumber === tableNumber &&
    reservationsOverlap(
      reservationDateTime,
      durationMinutes,
      existing.reservationTime,
      existing.durationMinutes || 120
    )
  );
};

const getAvailableTableNumbers = async (reservationDateTime, durationMinutes, excludeReservationId = null) => {
  const overlapping = await getOverlappingReservations(
    reservationDateTime,
    durationMinutes,
    excludeReservationId
  );

  const available = [];
  for (let tableNumber = 1; tableNumber <= TOTAL_TABLES; tableNumber += 1) {
    const blocked = overlapping.some(existing =>
      existing.tableNumber === tableNumber &&
      reservationsOverlap(
        reservationDateTime,
        durationMinutes,
        existing.reservationTime,
        existing.durationMinutes || 120
      )
    );
    if (!blocked) {
      available.push(tableNumber);
    }
  }

  return available;
};

const resolveCustomerId = async (req, customerIdFromBody) => {
  if (req.user.role === 'CUSTOMER') {
    if (!req.user.customerProfile || !req.user.customerProfile.customerId) {
      throw new Error('Customer profile not found');
    }

    return req.user.customerProfile.customerId;
  }

  return customerIdFromBody ? parseInt(customerIdFromBody, 10) : null;
};

// Get all reservations
exports.getAllReservations = async (req, res) => {
  try {
    const { status, date, customerId, search } = req.query;
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

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
      where.customerId = parseInt(customerId, 10);
    }

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

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const searchConditions = [
        { guestName: { contains: trimmedSearch, mode: 'insensitive' } },
        {
          customer: {
            is: {
              fullName: { contains: trimmedSearch, mode: 'insensitive' },
            },
          },
        },
      ];

      if (/^\d+$/.test(trimmedSearch)) {
        const numericValue = parseInt(trimmedSearch, 10);
        searchConditions.push({ tableNumber: numericValue });
        searchConditions.push({ reservationId: numericValue });
      }

      where.OR = searchConditions;
    }

    const include = {
      customer: {
        include: {
          user: true,
        },
      },
    };

    if (hasPagination) {
      const [reservations, total] = await Promise.all([
        prisma.reservation.findMany({
          where,
          skip,
          take: limit,
          include,
          orderBy: {
            reservationTime: 'desc',
          },
        }),
        prisma.reservation.count({ where }),
      ]);

      return res.json({
        success: true,
        data: reservations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      });
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include,
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

exports.getReservationConfig = async (req, res) => {
  res.json({
    success: true,
    data: {
      totalTables: TOTAL_TABLES,
      maxGuestsPerTable: MAX_GUESTS_PER_TABLE,
      amountPerGuest: RESERVATION_AMOUNT_PER_GUEST,
      durationOptionsMinutes: DURATION_OPTIONS_MINUTES,
    },
  });
};

// Get single reservation by ID
exports.getReservationById = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id, 10) },
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

    if (req.user.role === 'CUSTOMER') {
      if (
        !req.user.customerProfile ||
        req.user.customerProfile.customerId !== reservation.customerId
      ) {
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
    let {
      customerId,
      tableNumber,
      reservationTime,
      guestCount,
      numberOfGuests,
      durationMinutes,
      guestName,
      guestPhone,
      status,
    } = req.body;

    const guestValidation = validateGuestCount(numberOfGuests || guestCount);
    if (!guestValidation.valid) {
      return res.status(400).json({ success: false, message: guestValidation.message });
    }
    const guests = guestValidation.guests;

    const durationValidation = validateDuration(durationMinutes || 120);
    if (!durationValidation.valid) {
      return res.status(400).json({ success: false, message: durationValidation.message });
    }
    const duration = durationValidation.duration;

    const tableValidation = validateTableNumber(tableNumber);
    if (!tableValidation.valid) {
      return res.status(400).json({ success: false, message: tableValidation.message });
    }
    const parsedTableNumber = tableValidation.table;

    const isStaffUser = ['ADMIN', 'MANAGER'].includes(req.user.role);

    if (isStaffUser) {
      customerId = customerId ? parseInt(customerId, 10) : null;
    } else {
      customerId = await resolveCustomerId(req, customerId);
    }

    if (!reservationTime) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time is required',
      });
    }

    if (isStaffUser && !customerId && (!guestName || guestName.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID or guest name is required',
      });
    }

    if (!isStaffUser && !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer profile is required',
      });
    }

    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { customerId },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
      }
    }

    const reservationDateTime = new Date(reservationTime);

    if (Number.isNaN(reservationDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation time',
      });
    }

    if (reservationDateTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time must be in the future',
      });
    }

    const tableAvailable = await isTableAvailable(parsedTableNumber, reservationDateTime, duration);
    if (!tableAvailable) {
      return res.status(400).json({
        success: false,
        message: `Table ${parsedTableNumber} is not available for the selected date, time, and duration`,
      });
    }

    const { reservationAmount } = calculateReservationAmounts(guests);
    const reservationStatus = isStaffUser && status ? status : 'PENDING';

    const reservation = await prisma.reservation.create({
      data: {
        customerId,
        guestName: !customerId ? guestName?.trim() : null,
        guestPhone: !customerId ? guestPhone?.trim() || null : null,
        tableNumber: parsedTableNumber,
        reservationTime: reservationDateTime,
        durationMinutes: duration,
        guestCount: guests,
        status: reservationStatus,
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
      data: {
        ...reservation,
        amountDue: reservationAmount,
      },
    });
  } catch (error) {
    console.error('Error creating reservation:', error);

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
    let { customerId, reservationTime, guestCount, numberOfGuests, durationMinutes, tableNumber } = req.body;
    const guests = parseInt(numberOfGuests || guestCount, 10);
    customerId = await resolveCustomerId(req, customerId);

    const guestValidation = validateGuestCount(guests);
    if (!guestValidation.valid) {
      return res.status(400).json({ success: false, message: guestValidation.message });
    }

    const durationValidation = validateDuration(durationMinutes || 120);
    if (!durationValidation.valid) {
      return res.status(400).json({ success: false, message: durationValidation.message });
    }
    const duration = durationValidation.duration;

    const tableValidation = validateTableNumber(tableNumber);
    if (!tableValidation.valid) {
      return res.status(400).json({ success: false, message: tableValidation.message });
    }
    const parsedTableNumber = tableValidation.table;

    if (!customerId || !reservationTime) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time and table are required',
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { customerId: parseInt(customerId, 10) },
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

    const tableAvailable = await isTableAvailable(parsedTableNumber, reservationDateTime, duration);
    if (!tableAvailable) {
      return res.status(400).json({
        success: false,
        message: `Table ${parsedTableNumber} is no longer available. Please select another table.`,
      });
    }

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
        tableNumber: String(parsedTableNumber),
        durationMinutes: String(duration),
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

    if (error.message === 'Customer profile not found') {
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
    let {
      customerId,
      tableNumber,
      reservationTime,
      guestCount,
      numberOfGuests,
      durationMinutes,
    } = reservationData || {};
    const guests = parseInt(numberOfGuests || guestCount, 10);
    customerId = await resolveCustomerId(req, customerId);

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required',
      });
    }

    const guestValidation = validateGuestCount(guests);
    if (!guestValidation.valid) {
      return res.status(400).json({ success: false, message: guestValidation.message });
    }

    const durationValidation = validateDuration(durationMinutes || 120);
    if (!durationValidation.valid) {
      return res.status(400).json({ success: false, message: durationValidation.message });
    }
    const duration = durationValidation.duration;

    const tableValidation = validateTableNumber(tableNumber);
    if (!tableValidation.valid) {
      return res.status(400).json({ success: false, message: tableValidation.message });
    }
    const parsedTableNumber = tableValidation.table;

    if (!customerId || !reservationTime) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time and table are required',
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { customerId: parseInt(customerId, 10) },
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

    const tableAvailable = await isTableAvailable(parsedTableNumber, reservationDateTime, duration);
    if (!tableAvailable) {
      return res.status(400).json({
        success: false,
        message: `Table ${parsedTableNumber} is no longer available. Please select another table.`,
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

    const reservation = await prisma.reservation.create({
      data: {
        customerId: parseInt(customerId, 10),
        tableNumber: parsedTableNumber,
        reservationTime: reservationDateTime,
        durationMinutes: duration,
        guestCount: guests,
        status: 'CONFIRMED',
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

exports.recordPhysicalPayment = async (req, res) => {
  try {
    const { id } = req.params;

    const existingReservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id, 10) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    if (existingReservation.paymentStatus === 'PAID') {
      return res.status(400).json({
        success: false,
        message: 'Reservation is already fully paid',
      });
    }

    const reservationAmount = Number(existingReservation.reservationAmount);

    const reservation = await prisma.reservation.update({
      where: { reservationId: parseInt(id, 10) },
      data: {
        remainingAmount: 0,
        paymentStatus: 'PAID',
      },
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
      message: 'Physical payment recorded successfully',
      data: reservation,
    });
  } catch (error) {
    console.error('Error recording physical payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record physical payment',
      error: error.message,
    });
  }
};

exports.recordOnlinePayment = async (req, res) => {
  try {
    const { id } = req.params;

    const existingReservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id, 10) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    if (Number(existingReservation.onlinePaidAmount) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Online payment has already been recorded',
      });
    }

    const { onlinePaymentAmount, remainingAmount } = calculateReservationAmounts(
      existingReservation.guestCount
    );

    const reservation = await prisma.reservation.update({
      where: { reservationId: parseInt(id, 10) },
      data: {
        onlinePaidAmount: onlinePaymentAmount,
        remainingAmount,
        paymentStatus: 'PARTIAL',
        status: existingReservation.status === 'PENDING' ? 'CONFIRMED' : existingReservation.status,
      },
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
      message: 'Online payment recorded successfully',
      data: reservation,
    });
  } catch (error) {
    console.error('Error recording online payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record online payment',
      error: error.message,
    });
  }
};

// Update reservation
exports.updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { tableNumber, reservationTime, guestCount, durationMinutes, status } = req.body;

    const existingReservation = await prisma.reservation.findUnique({
      where: { reservationId: parseInt(id, 10) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    const newTableNumber = tableNumber !== undefined
      ? parseInt(tableNumber, 10)
      : existingReservation.tableNumber;
    const newReservationTime = reservationTime
      ? new Date(reservationTime)
      : existingReservation.reservationTime;
    const newDuration = durationMinutes !== undefined
      ? parseInt(durationMinutes, 10)
      : existingReservation.durationMinutes || 120;
    const newGuestCount = guestCount !== undefined
      ? parseInt(guestCount, 10)
      : existingReservation.guestCount;

    if (guestCount !== undefined) {
      const guestValidation = validateGuestCount(newGuestCount);
      if (!guestValidation.valid) {
        return res.status(400).json({ success: false, message: guestValidation.message });
      }
    }

    if (durationMinutes !== undefined) {
      const durationValidation = validateDuration(newDuration);
      if (!durationValidation.valid) {
        return res.status(400).json({ success: false, message: durationValidation.message });
      }
    }

    if (tableNumber !== undefined || reservationTime !== undefined || durationMinutes !== undefined) {
      const tableAvailable = await isTableAvailable(
        newTableNumber,
        newReservationTime,
        newDuration,
        parseInt(id, 10)
      );

      if (!tableAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Table is not available for the selected date, time, and duration',
        });
      }
    }

    const updateData = {};
    if (tableNumber !== undefined) updateData.tableNumber = newTableNumber;
    if (reservationTime !== undefined) updateData.reservationTime = newReservationTime;
    if (guestCount !== undefined) {
      updateData.guestCount = newGuestCount;
      const { reservationAmount, remainingAmount } = calculateReservationAmounts(newGuestCount);
      updateData.reservationAmount = reservationAmount;
      updateData.remainingAmount = roundMoney(
        reservationAmount - Number(existingReservation.onlinePaidAmount)
      );
      if (updateData.remainingAmount < 0) updateData.remainingAmount = 0;
    }
    if (durationMinutes !== undefined) updateData.durationMinutes = newDuration;
    if (status !== undefined) updateData.status = status;

    const reservation = await prisma.reservation.update({
      where: { reservationId: parseInt(id, 10) },
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
      where: { reservationId: parseInt(id, 10) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    if (req.user.role === 'CUSTOMER') {
      if (
        !req.user.customerProfile ||
        req.user.customerProfile.customerId !== existingReservation.customerId
      ) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only cancel your own reservations.',
        });
      }
    }

    const reservation = await prisma.reservation.update({
      where: { reservationId: parseInt(id, 10) },
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
      where: { reservationId: parseInt(id, 10) },
    });

    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found',
      });
    }

    await prisma.reservation.delete({
      where: { reservationId: parseInt(id, 10) },
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

// Get available tables for a specific time and duration
exports.getAvailableTables = async (req, res) => {
  try {
    const { reservationTime, durationMinutes } = req.query;

    if (!reservationTime) {
      return res.status(400).json({
        success: false,
        message: 'Reservation time is required',
      });
    }

    const durationValidation = validateDuration(durationMinutes || 120);
    if (!durationValidation.valid) {
      return res.status(400).json({ success: false, message: durationValidation.message });
    }
    const duration = durationValidation.duration;

    const requestedTime = new Date(reservationTime);

    if (Number.isNaN(requestedTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation time',
      });
    }

    const availableTables = await getAvailableTableNumbers(requestedTime, duration);
    const reservedTables = [];

    for (let i = 1; i <= TOTAL_TABLES; i += 1) {
      if (!availableTables.includes(i)) {
        reservedTables.push(i);
      }
    }

    res.json({
      success: true,
      data: {
        availableTables,
        reservedTables,
        totalTables: TOTAL_TABLES,
        maxGuestsPerTable: MAX_GUESTS_PER_TABLE,
        durationMinutes: duration,
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
