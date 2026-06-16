const prisma = require('../config/database');
const { getEmployeeLeaveBalance } = require('./leaveBalance.service');

const TOPIC_PATTERNS = {
  menu: /\b(menu|dish|dishes|food|item|items|price|prices|category|categories|available|specials?)\b/i,
  orders: /\b(order|orders|pending|preparing|ready|served|completed|cancelled|revenue|sales|kitchen)\b/i,
  inventory: /\b(inventory|stock|ingredient|ingredients|low stock|reorder|supply|supplies)\b/i,
  reservations: /\b(reservation|reservations|table|booking|book|guests?)\b/i,
  employees: /\b(employee|employees|staff|waiter|waiters|chef|chefs|team|workforce)\b/i,
  reviews: /\b(review|reviews|rating|ratings|feedback|stars?)\b/i,
  attendance: /\b(attendance|check.?in|check.?out|present|late|punch|shift)\b/i,
  leave: /\b(leave|vacation|time off|holiday|absence|day off)\b/i,
};

const ROLE_ALLOWED_TOPICS = {
  ADMIN: ['overview', 'menu', 'orders', 'inventory', 'reservations', 'employees', 'reviews', 'leave', 'attendance'],
  MANAGER: ['overview', 'menu', 'orders', 'inventory', 'reservations', 'employees', 'reviews', 'leave', 'attendance'],
  WAITER: ['overview', 'menu', 'orders', 'attendance', 'leave'],
  CHEF: ['overview', 'orders', 'leave'],
  CUSTOMER: ['overview', 'menu', 'orders', 'reservations', 'reviews'],
};

const toNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfToday = () => {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
};

const detectTopics = (message) => {
  const matched = Object.entries(TOPIC_PATTERNS)
    .filter(([, pattern]) => pattern.test(message))
    .map(([topic]) => topic);

  return matched.length > 0 ? matched : ['overview'];
};

const resolveTopicsForRole = (role, message) => {
  const allowed = ROLE_ALLOWED_TOPICS[role] || ['overview'];
  const detected = detectTopics(message);
  const topics = [...new Set([...detected, 'overview'].filter((topic) => allowed.includes(topic)))];
  return topics.slice(0, 4);
};

const fetchOverviewContext = async (user) => {
  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  if (user.role === 'CUSTOMER' && user.customerProfile?.customerId) {
    const customerId = user.customerProfile.customerId;
    const [recentOrders, upcomingReservations] = await Promise.all([
      prisma.order.count({
        where: { customerId, createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.reservation.count({
        where: {
          customerId,
          reservationTime: { gte: new Date() },
          status: { in: ['CONFIRMED', 'PENDING'] },
        },
      }),
    ]);

    return {
      scope: 'customer',
      ordersToday: recentOrders,
      upcomingReservations,
    };
  }

  if (['WAITER', 'CHEF'].includes(user.role) && user.employeeProfile?.employeeId) {
    const employeeId = user.employeeProfile.employeeId;
    const todayAttendance = await prisma.attendance.findFirst({
      where: { employeeId, date: todayStart },
    });

    return {
      scope: user.role.toLowerCase(),
      todayAttendance: todayAttendance
        ? {
            status: todayAttendance.status,
            checkInTime: todayAttendance.checkInTime,
            checkOutTime: todayAttendance.checkOutTime,
          }
        : null,
    };
  }

  const [
    ordersToday,
    pendingOrders,
    preparingOrders,
    todayReservations,
    lowStockCount,
    pendingLeaveRequests,
    totalMenuItems,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.count({ where: { status: 'PREPARING' } }),
    prisma.reservation.count({
      where: {
        reservationTime: { gte: todayStart, lt: todayEnd },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    }),
    prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "InventoryItem" WHERE quantity <= "reorderLevel"`,
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.menuItem.count({ where: { isAvailable: true } }),
  ]);

  return {
    scope: 'admin',
    ordersToday,
    pendingOrders,
    preparingOrders,
    todayReservations,
    lowStockCount: lowStockCount[0]?.count || 0,
    pendingLeaveRequests,
    availableMenuItems: totalMenuItems,
  };
};

const fetchMenuContext = async () => {
  const [categories, items, unavailableCount] = await Promise.all([
    prisma.category.findMany({
      select: { name: true, _count: { select: { menuItems: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.menuItem.findMany({
      where: { isAvailable: true },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 25,
    }),
    prisma.menuItem.count({ where: { isAvailable: false } }),
  ]);

  return {
    categories: categories.map((category) => ({
      name: category.name,
      itemCount: category._count.menuItems,
    })),
    availableItems: items.map((item) => ({
      name: item.name,
      category: item.category.name,
      priceLKR: toNumber(item.price),
      description: item.description,
    })),
    unavailableItemCount: unavailableCount,
  };
};

const fetchOrdersContext = async (user) => {
  const todayStart = startOfToday();

  if (user.role === 'CUSTOMER' && user.customerProfile?.customerId) {
    const orders = await prisma.order.findMany({
      where: { customerId: user.customerProfile.customerId },
      include: {
        items: {
          include: { menuItem: { select: { name: true } } },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    return {
      recentOrders: orders.map((order) => ({
        orderId: order.orderId,
        status: order.status,
        type: order.type,
        totalAmountLKR: toNumber(order.totalAmount),
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          name: item.menuItem.name,
          quantity: item.quantity,
        })),
      })),
    };
  }

  if (user.role === 'WAITER' && user.employeeProfile?.employeeId) {
    const [assignedOrders, activeOrders] = await Promise.all([
      prisma.order.findMany({
        where: { staffId: user.employeeProfile.employeeId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          orderId: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          guestName: true,
        },
      }),
      prisma.order.findMany({
        where: { status: { in: ['PENDING', 'PREPARING', 'READY'] } },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: {
          orderId: true,
          status: true,
          type: true,
          tableNumber: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      myRecentOrders: assignedOrders.map((order) => ({
        ...order,
        totalAmountLKR: toNumber(order.totalAmount),
      })),
      activeOrders: activeOrders.map((order) => ({
        ...order,
        totalAmountLKR: toNumber(order.totalAmount),
      })),
    };
  }

  if (user.role === 'CHEF') {
    const kitchenOrders = await prisma.order.findMany({
      where: { status: { in: ['PENDING', 'PREPARING', 'READY'] } },
      include: {
        items: {
          include: { menuItem: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    return {
      kitchenQueue: kitchenOrders.map((order) => ({
        orderId: order.orderId,
        status: order.status,
        type: order.type,
        tableNumber: order.tableNumber,
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          name: item.menuItem.name,
          quantity: item.quantity,
          customization: item.customization,
        })),
      })),
    };
  }

  const [statusCounts, recentOrders, todayRevenue] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        orderId: true,
        status: true,
        type: true,
        totalAmount: true,
        createdAt: true,
        guestName: true,
        customer: { select: { fullName: true } },
      },
    }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: todayStart },
        status: { not: 'CANCELLED' },
      },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    statusCounts: statusCounts.map((entry) => ({
      status: entry.status,
      count: entry._count._all,
    })),
    todayRevenueLKR: toNumber(todayRevenue._sum.totalAmount),
    recentOrders: recentOrders.map((order) => ({
      orderId: order.orderId,
      status: order.status,
      type: order.type,
      customerName: order.customer?.fullName || order.guestName || 'Walk-in',
      totalAmountLKR: toNumber(order.totalAmount),
      createdAt: order.createdAt,
    })),
  };
};

const fetchInventoryContext = async () => {
  const [statsRows, lowStockItems] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        COUNT(*)::int AS "totalItems",
        COUNT(*) FILTER (WHERE quantity <= "reorderLevel")::int AS "lowStockCount",
        COALESCE(SUM(quantity * "costPerUnit"), 0)::float AS "totalValue"
      FROM "InventoryItem"
    `,
    prisma.$queryRaw`
      SELECT "itemName", quantity, unit, "reorderLevel", "costPerUnit"
      FROM "InventoryItem"
      WHERE quantity <= "reorderLevel"
      ORDER BY quantity ASC
      LIMIT 15
    `,
  ]);

  const stats = statsRows[0] || {};

  return {
    totalItems: stats.totalItems || 0,
    lowStockCount: stats.lowStockCount || 0,
    totalValueLKR: toNumber(stats.totalValue),
    lowStockItems: lowStockItems.map((item) => ({
      itemName: item.itemName,
      quantity: toNumber(item.quantity),
      unit: item.unit,
      reorderLevel: toNumber(item.reorderLevel),
      costPerUnitLKR: toNumber(item.costPerUnit),
    })),
  };
};

const fetchReservationsContext = async (user) => {
  const now = new Date();
  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  if (user.role === 'CUSTOMER' && user.customerProfile?.customerId) {
    const reservations = await prisma.reservation.findMany({
      where: { customerId: user.customerProfile.customerId },
      orderBy: { reservationTime: 'desc' },
      take: 8,
    });

    return {
      myReservations: reservations.map((reservation) => ({
        reservationId: reservation.reservationId,
        status: reservation.status,
        reservationTime: reservation.reservationTime,
        guestCount: reservation.guestCount,
        tableNumber: reservation.tableNumber,
      })),
    };
  }

  const [todayReservations, upcomingReservations, statusCounts] = await Promise.all([
    prisma.reservation.findMany({
      where: { reservationTime: { gte: todayStart, lt: todayEnd } },
      include: { customer: { select: { fullName: true } } },
      orderBy: { reservationTime: 'asc' },
      take: 12,
    }),
    prisma.reservation.count({
      where: {
        reservationTime: { gte: now },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    }),
    prisma.reservation.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  return {
    upcomingConfirmedOrPending: upcomingReservations,
    statusCounts: statusCounts.map((entry) => ({
      status: entry.status,
      count: entry._count._all,
    })),
    todayReservations: todayReservations.map((reservation) => ({
      reservationId: reservation.reservationId,
      status: reservation.status,
      reservationTime: reservation.reservationTime,
      guestCount: reservation.guestCount,
      tableNumber: reservation.tableNumber,
      customerName: reservation.customer?.fullName || reservation.guestName || 'Walk-in',
    })),
  };
};

const fetchEmployeesContext = async () => {
  const employees = await prisma.user.findMany({
    where: {
      role: { in: ['WAITER', 'CHEF'] },
      employeeProfile: { isNot: null },
    },
    include: { employeeProfile: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const roleCounts = await prisma.user.groupBy({
    by: ['role'],
    where: { role: { in: ['ADMIN', 'MANAGER', 'WAITER', 'CHEF'] }, isActive: true },
    _count: { _all: true },
  });

  return {
    activeStaffByRole: roleCounts.map((entry) => ({
      role: entry.role,
      count: entry._count._all,
    })),
    staff: employees.map((employee) => ({
      fullName: employee.employeeProfile.fullName,
      role: employee.role,
      designation: employee.employeeProfile.designation,
      isActive: employee.isActive,
    })),
  };
};

const fetchReviewsContext = async (user) => {
  if (user.role === 'CUSTOMER' && user.customerProfile?.customerId) {
    const reviews = await prisma.review.findMany({
      where: { customerId: user.customerProfile.customerId },
      include: { menuItem: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    return {
      myReviews: reviews.map((review) => ({
        menuItem: review.menuItem.name,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      })),
    };
  }

  const [aggregate, recentReviews, distribution] = await Promise.all([
    prisma.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
    prisma.review.findMany({
      include: {
        customer: { select: { fullName: true } },
        menuItem: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    Promise.all([5, 4, 3, 2, 1].map((rating) =>
      prisma.review.count({ where: { rating } }).then((count) => ({ rating, count }))
    )),
  ]);

  return {
    totalReviews: aggregate._count._all,
    averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : 0,
    ratingDistribution: distribution,
    recentReviews: recentReviews.map((review) => ({
      customerName: review.customer.fullName,
      menuItem: review.menuItem.name,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
    })),
  };
};

const fetchAttendanceContext = async (user) => {
  if (!user.employeeProfile?.employeeId) {
    return { message: 'Attendance data is only available for staff accounts.' };
  }

  const employeeId = user.employeeProfile.employeeId;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [todayAttendance, recentAttendance] = await Promise.all([
    prisma.attendance.findFirst({
      where: { employeeId, date: startOfToday() },
    }),
    prisma.attendance.findMany({
      where: { employeeId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'desc' },
      take: 10,
    }),
  ]);

  const stats = recentAttendance.reduce(
    (acc, record) => {
      if (record.status === 'PRESENT') acc.presentDays += 1;
      if (record.status === 'LATE') acc.lateDays += 1;
      if (record.status === 'ABSENT') acc.absentDays += 1;
      return acc;
    },
    { presentDays: 0, lateDays: 0, absentDays: 0 }
  );

  return {
    todayAttendance: todayAttendance
      ? {
          status: todayAttendance.status,
          checkInTime: todayAttendance.checkInTime,
          checkOutTime: todayAttendance.checkOutTime,
        }
      : null,
    last30Days: stats,
    recentRecords: recentAttendance.map((record) => ({
      date: record.date,
      status: record.status,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
    })),
  };
};

const fetchLeaveContext = async (user) => {
  if (!user.employeeProfile?.employeeId) {
    return { message: 'Leave data is only available for staff accounts.' };
  }

  const employeeId = user.employeeProfile.employeeId;
  const year = new Date().getFullYear();

  const [balance, requests] = await Promise.all([
    getEmployeeLeaveBalance(employeeId, year),
    prisma.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { appliedAt: 'desc' },
      take: 8,
    }),
  ]);

  let pendingForAdmin = null;
  if (['ADMIN', 'MANAGER'].includes(user.role)) {
    pendingForAdmin = await prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        employee: { select: { fullName: true, designation: true } },
      },
      orderBy: { appliedAt: 'asc' },
      take: 10,
    });
  }

  return {
    year,
    balance,
    myRequests: requests.map((request) => ({
      leaveType: request.leaveType,
      status: request.status,
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: request.totalDays,
      reason: request.reason,
    })),
    pendingRequestsForApproval: pendingForAdmin
      ? pendingForAdmin.map((request) => ({
          employeeName: request.employee.fullName,
          designation: request.employee.designation,
          leaveType: request.leaveType,
          startDate: request.startDate,
          endDate: request.endDate,
          totalDays: request.totalDays,
          reason: request.reason,
        }))
      : undefined,
  };
};

const TOPIC_FETCHERS = {
  overview: fetchOverviewContext,
  menu: fetchMenuContext,
  orders: fetchOrdersContext,
  inventory: fetchInventoryContext,
  reservations: fetchReservationsContext,
  employees: fetchEmployeesContext,
  reviews: fetchReviewsContext,
  attendance: fetchAttendanceContext,
  leave: fetchLeaveContext,
};

const buildRestaurantContext = async (user, message) => {
  const topics = resolveTopicsForRole(user.role, message);
  const context = {
    generatedAt: new Date().toISOString(),
    user: {
      role: user.role,
      email: user.email,
    },
    topicsLoaded: topics,
    data: {},
  };

  await Promise.all(
    topics.map(async (topic) => {
      try {
        context.data[topic] = await TOPIC_FETCHERS[topic](user);
      } catch (error) {
        console.error(`Chatbot context fetch failed for topic "${topic}":`, error);
        context.data[topic] = { error: 'Unable to load this data right now.' };
      }
    })
  );

  return JSON.stringify(context, null, 2);
};

module.exports = {
  detectTopics,
  resolveTopicsForRole,
  buildRestaurantContext,
};
