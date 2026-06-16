const prisma = require('../config/database');

const REVENUE_STATUSES = ['COMPLETED', 'SERVED'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const buildRevenueByType = (rows) => {
  const revenueByType = { DINE_IN: 0, TAKEAWAY: 0 };
  rows.forEach((row) => {
    const type = row.type === 'ONLINE_DELIVERY' ? 'TAKEAWAY' : row.type;
    if (revenueByType[type] !== undefined) {
      revenueByType[type] += parseFloat(row.revenue);
    }
  });
  return revenueByType;
};

const fetchRevenueByType = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      o."type" AS type,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
    GROUP BY o."type"
  `;
  return buildRevenueByType(rows);
};

const buildSummary = (breakdown) => {
  const totalRevenue = breakdown.reduce((sum, row) => sum + row.revenue, 0);
  const totalOrders = breakdown.reduce((sum, row) => sum + row.orders, 0);
  return {
    totalRevenue: roundMoney(totalRevenue),
    totalOrders,
    averageOrderValue: totalOrders > 0 ? roundMoney(totalRevenue / totalOrders) : 0,
  };
};

const getDailyRevenue = async (year, month) => {
  const now = new Date();
  const targetYear = year ? parseInt(year, 10) : now.getFullYear();
  const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;

  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 1);
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);

  const rows = await prisma.$queryRaw`
    SELECT
      DATE("createdAt") AS day,
      COALESCE(SUM("totalAmount"), 0) AS revenue,
      COUNT(*)::int AS orders
    FROM "Order"
    WHERE "createdAt" >= ${startDate}
      AND "createdAt" < ${endDate}
      AND "status" IN ('COMPLETED', 'SERVED')
    GROUP BY DATE("createdAt")
    ORDER BY day ASC
  `;

  const rowMap = new Map(
    rows.map((row) => [
      new Date(row.day).getDate(),
      {
        revenue: roundMoney(Number(row.revenue)),
        orders: Number(row.orders),
      },
    ])
  );

  const breakdown = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(targetYear, targetMonth - 1, day);
    const isoDate = date.toISOString().split('T')[0];
    const entry = rowMap.get(day) || { revenue: 0, orders: 0 };
    breakdown.push({
      label: `${MONTH_NAMES[targetMonth - 1]} ${day}`,
      date: isoDate,
      revenue: entry.revenue,
      orders: entry.orders,
    });
  }

  return {
    view: 'daily',
    periodLabel: `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`,
    year: targetYear,
    month: targetMonth,
    breakdown,
    summary: buildSummary(breakdown),
    revenueByType: await fetchRevenueByType(startDate, endDate),
  };
};

const getMonthlyRevenue = async (year) => {
  const now = new Date();
  const targetYear = year ? parseInt(year, 10) : now.getFullYear();

  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear + 1, 0, 1);

  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(MONTH FROM "createdAt")::int AS month_num,
      COALESCE(SUM("totalAmount"), 0) AS revenue,
      COUNT(*)::int AS orders
    FROM "Order"
    WHERE "createdAt" >= ${startDate}
      AND "createdAt" < ${endDate}
      AND "status" IN ('COMPLETED', 'SERVED')
    GROUP BY EXTRACT(MONTH FROM "createdAt")
    ORDER BY month_num ASC
  `;

  const rowMap = new Map(
    rows.map((row) => [
      Number(row.month_num),
      {
        revenue: roundMoney(Number(row.revenue)),
        orders: Number(row.orders),
      },
    ])
  );

  const breakdown = [];
  for (let month = 1; month <= 12; month += 1) {
    const entry = rowMap.get(month) || { revenue: 0, orders: 0 };
    breakdown.push({
      label: MONTH_NAMES[month - 1],
      date: `${targetYear}-${String(month).padStart(2, '0')}`,
      revenue: entry.revenue,
      orders: entry.orders,
    });
  }

  return {
    view: 'monthly',
    periodLabel: String(targetYear),
    year: targetYear,
    breakdown,
    summary: buildSummary(breakdown),
    revenueByType: await fetchRevenueByType(startDate, endDate),
  };
};

const getYearlyRevenue = async (yearsBack = 5) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const count = Math.min(Math.max(parseInt(yearsBack, 10) || 5, 1), 10);
  const startYear = currentYear - count + 1;

  const startDate = new Date(startYear, 0, 1);
  const endDate = new Date(currentYear + 1, 0, 1);

  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM "createdAt")::int AS year,
      COALESCE(SUM("totalAmount"), 0) AS revenue,
      COUNT(*)::int AS orders
    FROM "Order"
    WHERE "createdAt" >= ${startDate}
      AND "createdAt" < ${endDate}
      AND "status" IN ('COMPLETED', 'SERVED')
    GROUP BY EXTRACT(YEAR FROM "createdAt")
    ORDER BY year ASC
  `;

  const rowMap = new Map(
    rows.map((row) => [
      Number(row.year),
      {
        revenue: roundMoney(Number(row.revenue)),
        orders: Number(row.orders),
      },
    ])
  );

  const breakdown = [];
  for (let year = startYear; year <= currentYear; year += 1) {
    const entry = rowMap.get(year) || { revenue: 0, orders: 0 };
    breakdown.push({
      label: String(year),
      date: String(year),
      revenue: entry.revenue,
      orders: entry.orders,
    });
  }

  return {
    view: 'yearly',
    periodLabel: `${startYear} – ${currentYear}`,
    yearsBack: count,
    breakdown,
    summary: buildSummary(breakdown),
    revenueByType: await fetchRevenueByType(startDate, endDate),
  };
};

const getRevenueAnalytics = async ({ view = 'daily', year, month, yearsBack }) => {
  switch (view) {
    case 'monthly':
      return getMonthlyRevenue(year);
    case 'yearly':
      return getYearlyRevenue(yearsBack);
    case 'daily':
    default:
      return getDailyRevenue(year, month);
  }
};

module.exports = {
  getRevenueAnalytics,
  REVENUE_STATUSES,
};
