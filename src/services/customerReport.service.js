const prisma = require('../config/database');

const ORDER_STATUSES = ['COMPLETED', 'SERVED'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const getDateRange = (view, year, month, yearsBack) => {
  const now = new Date();
  if (view === 'daily') {
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
    return {
      startDate: new Date(targetYear, targetMonth - 1, 1),
      endDate: new Date(targetYear, targetMonth, 1),
      targetYear,
      targetMonth,
    };
  }
  if (view === 'monthly') {
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();
    return {
      startDate: new Date(targetYear, 0, 1),
      endDate: new Date(targetYear + 1, 0, 1),
      targetYear,
    };
  }
  const currentYear = now.getFullYear();
  const count = Math.min(Math.max(parseInt(yearsBack, 10) || 5, 1), 10);
  const startYear = currentYear - count + 1;
  return {
    startDate: new Date(startYear, 0, 1),
    endDate: new Date(currentYear + 1, 0, 1),
    startYear,
    currentYear,
    yearsBack: count,
  };
};

const getTopCustomers = async (startDate, endDate) => {
  const topCustomers = await prisma.customer.findMany({
    where: {
      orders: {
        some: {
          createdAt: { gte: startDate, lt: endDate },
          status: { in: ORDER_STATUSES },
        },
      },
    },
    select: {
      customerId: true,
      fullName: true,
      loyaltyPoints: true,
      user: { select: { email: true } },
      orders: {
        where: {
          createdAt: { gte: startDate, lt: endDate },
          status: { in: ORDER_STATUSES },
        },
        select: { totalAmount: true },
      },
    },
    take: 50,
  });

  return topCustomers
    .map((customer) => ({
      customerId: customer.customerId,
      name: customer.fullName,
      email: customer.user?.email || 'N/A',
      loyaltyPoints: customer.loyaltyPoints,
      orderCount: customer.orders.length,
      totalSpent: customer.orders.reduce(
        (sum, order) => sum + parseFloat(order.totalAmount),
        0
      ),
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);
};

const getPeriodSummary = async (startDate, endDate) => {
  const [newCustomers, activeCustomerRows, repeatCustomerRows] = await Promise.all([
    prisma.customer.count({
      where: {
        user: {
          createdAt: { gte: startDate, lt: endDate },
        },
      },
    }),
    prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lt: endDate },
        status: { in: ORDER_STATUSES },
        customerId: { not: null },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT o."customerId"
        FROM "Order" o
        WHERE o."createdAt" >= ${startDate}
          AND o."createdAt" < ${endDate}
          AND o."status" IN ('COMPLETED', 'SERVED')
          AND o."customerId" IS NOT NULL
        GROUP BY o."customerId"
        HAVING COUNT(*) >= 2
      ) AS repeat_customers
    `,
  ]);

  const activeCustomers = activeCustomerRows.length;
  const repeatCustomers = Number(repeatCustomerRows[0]?.count || 0);
  const totalOrders = await prisma.order.count({
    where: {
      createdAt: { gte: startDate, lt: endDate },
      status: { in: ORDER_STATUSES },
    },
  });

  return {
    newCustomers,
    activeCustomers,
    repeatCustomers,
    retentionRate:
      activeCustomers > 0
        ? Number(((repeatCustomers / activeCustomers) * 100).toFixed(2))
        : 0,
    totalOrders,
  };
};

const mergeBreakdownRows = (keys, newMap, activeMap, orderMap, labelFn) =>
  keys.map((key) => {
    const newEntry = newMap.get(key) || { newCustomers: 0 };
    const activeEntry = activeMap.get(key) || { activeCustomers: 0, orders: 0 };
    return {
      label: labelFn(key),
      date: String(key),
      newCustomers: newEntry.newCustomers,
      activeCustomers: activeEntry.activeCustomers,
      orders: activeEntry.orders,
    };
  });

const getDailyCustomerAnalytics = async (year, month) => {
  const { startDate, endDate, targetYear, targetMonth } = getDateRange('daily', year, month);
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);

  const [newRows, activeRows, summary, topCustomers] = await Promise.all([
    prisma.$queryRaw`
      SELECT DATE(u."createdAt") AS day, COUNT(*)::int AS new_customers
      FROM "Customer" c
      JOIN "User" u ON c."userId" = u."userId"
      WHERE u."createdAt" >= ${startDate} AND u."createdAt" < ${endDate}
      GROUP BY DATE(u."createdAt")
      ORDER BY day ASC
    `,
    prisma.$queryRaw`
      SELECT
        DATE(o."createdAt") AS day,
        COUNT(DISTINCT o."customerId")::int AS active_customers,
        COUNT(*)::int AS orders
      FROM "Order" o
      WHERE o."createdAt" >= ${startDate}
        AND o."createdAt" < ${endDate}
        AND o."status" IN ('COMPLETED', 'SERVED')
        AND o."customerId" IS NOT NULL
      GROUP BY DATE(o."createdAt")
      ORDER BY day ASC
    `,
    getPeriodSummary(startDate, endDate),
    getTopCustomers(startDate, endDate),
  ]);

  const newMap = new Map(
    newRows.map((row) => [new Date(row.day).getDate(), { newCustomers: Number(row.new_customers) }])
  );
  const activeMap = new Map(
    activeRows.map((row) => [
      new Date(row.day).getDate(),
      { activeCustomers: Number(row.active_customers), orders: Number(row.orders) },
    ])
  );

  const breakdown = mergeBreakdownRows(
    Array.from({ length: daysInMonth }, (_, i) => i + 1),
    newMap,
    activeMap,
    null,
    (day) => `${MONTH_NAMES[targetMonth - 1]} ${day}`
  ).map((row, index) => ({
    ...row,
    date: new Date(targetYear, targetMonth - 1, index + 1).toISOString().split('T')[0],
  }));

  return {
    view: 'daily',
    periodLabel: `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`,
    year: targetYear,
    month: targetMonth,
    breakdown,
    summary,
    topCustomers,
  };
};

const getMonthlyCustomerAnalytics = async (year) => {
  const { startDate, endDate, targetYear } = getDateRange('monthly', year);

  const [newRows, activeRows, summary, topCustomers] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        EXTRACT(MONTH FROM u."createdAt")::int AS month_num,
        COUNT(*)::int AS new_customers
      FROM "Customer" c
      JOIN "User" u ON c."userId" = u."userId"
      WHERE u."createdAt" >= ${startDate} AND u."createdAt" < ${endDate}
      GROUP BY EXTRACT(MONTH FROM u."createdAt")
      ORDER BY month_num ASC
    `,
    prisma.$queryRaw`
      SELECT
        EXTRACT(MONTH FROM o."createdAt")::int AS month_num,
        COUNT(DISTINCT o."customerId")::int AS active_customers,
        COUNT(*)::int AS orders
      FROM "Order" o
      WHERE o."createdAt" >= ${startDate}
        AND o."createdAt" < ${endDate}
        AND o."status" IN ('COMPLETED', 'SERVED')
        AND o."customerId" IS NOT NULL
      GROUP BY EXTRACT(MONTH FROM o."createdAt")
      ORDER BY month_num ASC
    `,
    getPeriodSummary(startDate, endDate),
    getTopCustomers(startDate, endDate),
  ]);

  const newMap = new Map(
    newRows.map((row) => [Number(row.month_num), { newCustomers: Number(row.new_customers) }])
  );
  const activeMap = new Map(
    activeRows.map((row) => [
      Number(row.month_num),
      { activeCustomers: Number(row.active_customers), orders: Number(row.orders) },
    ])
  );

  const breakdown = mergeBreakdownRows(
    Array.from({ length: 12 }, (_, i) => i + 1),
    newMap,
    activeMap,
    null,
    (month) => MONTH_NAMES[month - 1]
  ).map((row, index) => ({
    ...row,
    date: `${targetYear}-${String(index + 1).padStart(2, '0')}`,
  }));

  return {
    view: 'monthly',
    periodLabel: String(targetYear),
    year: targetYear,
    breakdown,
    summary,
    topCustomers,
  };
};

const getYearlyCustomerAnalytics = async (yearsBack) => {
  const { startDate, endDate, startYear, currentYear, yearsBack: count } = getDateRange(
    'yearly',
    null,
    null,
    yearsBack
  );

  const [newRows, activeRows, summary, topCustomers] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        EXTRACT(YEAR FROM u."createdAt")::int AS year,
        COUNT(*)::int AS new_customers
      FROM "Customer" c
      JOIN "User" u ON c."userId" = u."userId"
      WHERE u."createdAt" >= ${startDate} AND u."createdAt" < ${endDate}
      GROUP BY EXTRACT(YEAR FROM u."createdAt")
      ORDER BY year ASC
    `,
    prisma.$queryRaw`
      SELECT
        EXTRACT(YEAR FROM o."createdAt")::int AS year,
        COUNT(DISTINCT o."customerId")::int AS active_customers,
        COUNT(*)::int AS orders
      FROM "Order" o
      WHERE o."createdAt" >= ${startDate}
        AND o."createdAt" < ${endDate}
        AND o."status" IN ('COMPLETED', 'SERVED')
        AND o."customerId" IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM o."createdAt")
      ORDER BY year ASC
    `,
    getPeriodSummary(startDate, endDate),
    getTopCustomers(startDate, endDate),
  ]);

  const newMap = new Map(
    newRows.map((row) => [Number(row.year), { newCustomers: Number(row.new_customers) }])
  );
  const activeMap = new Map(
    activeRows.map((row) => [
      Number(row.year),
      { activeCustomers: Number(row.active_customers), orders: Number(row.orders) },
    ])
  );

  const years = Array.from({ length: currentYear - startYear + 1 }, (_, i) => startYear + i);
  const breakdown = mergeBreakdownRows(
    years,
    newMap,
    activeMap,
    null,
    (y) => String(y)
  );

  return {
    view: 'yearly',
    periodLabel: `${startYear} – ${currentYear}`,
    yearsBack: count,
    breakdown,
    summary,
    topCustomers,
  };
};

const getCustomerAnalytics = async ({ view = 'daily', year, month, yearsBack }) => {
  switch (view) {
    case 'monthly':
      return getMonthlyCustomerAnalytics(year);
    case 'yearly':
      return getYearlyCustomerAnalytics(yearsBack);
    case 'daily':
    default:
      return getDailyCustomerAnalytics(year, month);
  }
};

module.exports = { getCustomerAnalytics };
