const prisma = require('../config/database');

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const formatOrderType = (type) =>
  type === 'DINE_IN' ? 'Dine In' : type === 'TAKEAWAY' ? 'Takeaway' : type;

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

const mapTrendFields = (row) => ({
  orders: Number(row.orders),
  completed: Number(row.completed),
  cancelled: Number(row.cancelled),
  revenue: roundMoney(row.revenue),
});

const getDailyTrendRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      DATE(o."createdAt") AS day,
      COUNT(*)::int AS orders,
      COUNT(*) FILTER (WHERE o."status" IN ('COMPLETED', 'SERVED'))::int AS completed,
      COUNT(*) FILTER (WHERE o."status" = 'CANCELLED')::int AS cancelled,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
    GROUP BY DATE(o."createdAt")
    ORDER BY day ASC
  `;

const getMonthlyTrendRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      EXTRACT(MONTH FROM o."createdAt")::int AS month_num,
      COUNT(*)::int AS orders,
      COUNT(*) FILTER (WHERE o."status" IN ('COMPLETED', 'SERVED'))::int AS completed,
      COUNT(*) FILTER (WHERE o."status" = 'CANCELLED')::int AS cancelled,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
    GROUP BY EXTRACT(MONTH FROM o."createdAt")
    ORDER BY month_num ASC
  `;

const getYearlyTrendRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM o."createdAt")::int AS year,
      COUNT(*)::int AS orders,
      COUNT(*) FILTER (WHERE o."status" IN ('COMPLETED', 'SERVED'))::int AS completed,
      COUNT(*) FILTER (WHERE o."status" = 'CANCELLED')::int AS cancelled,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
    GROUP BY EXTRACT(YEAR FROM o."createdAt")
    ORDER BY year ASC
  `;

const getOrdersByStatus = async (startDate, endDate) => {
  const rows = await prisma.order.groupBy({
    by: ['status'],
    where: { createdAt: { gte: startDate, lt: endDate } },
    _count: { orderId: true },
    orderBy: { _count: { orderId: 'desc' } },
  });

  return rows.map((row) => ({
    status: row.status,
    count: row._count.orderId,
  }));
};

const getOrdersByType = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      o."type" AS type,
      COUNT(*)::int AS count,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
    GROUP BY o."type"
    ORDER BY count DESC
  `;

  return rows.map((row) => ({
    type: row.type,
    label: formatOrderType(row.type),
    count: Number(row.count),
    revenue: roundMoney(row.revenue),
  }));
};

const getPeakHours = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(HOUR FROM o."createdAt")::int AS hour,
      COUNT(*)::int AS count
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
    GROUP BY EXTRACT(HOUR FROM o."createdAt")
    ORDER BY hour ASC
  `;

  const hourMap = new Map(rows.map((row) => [Number(row.hour), Number(row.count)]));
  const peakHours = [];
  for (let hour = 0; hour < 24; hour += 1) {
    peakHours.push({ hour, count: hourMap.get(hour) || 0 });
  }
  return peakHours;
};

const buildPeriodSummary = (breakdown, peakHours) => {
  const totalOrders = breakdown.reduce((sum, row) => sum + row.orders, 0);
  const completedOrders = breakdown.reduce((sum, row) => sum + row.completed, 0);
  const cancelledOrders = breakdown.reduce((sum, row) => sum + row.cancelled, 0);
  const totalRevenue = roundMoney(breakdown.reduce((sum, row) => sum + row.revenue, 0));

  const peakHourEntry = peakHours.reduce(
    (peak, row) => (row.count > peak.count ? row : peak),
    { hour: 0, count: 0 }
  );

  const busiestPeriod = breakdown.reduce(
    (peak, row) => (row.orders > peak.orders ? row : peak),
    { label: '-', orders: 0 }
  );

  return {
    totalOrders,
    completedOrders,
    cancelledOrders,
    totalRevenue,
    completionRate:
      totalOrders > 0 ? roundMoney((completedOrders / totalOrders) * 100) : 0,
    cancellationRate:
      totalOrders > 0 ? roundMoney((cancelledOrders / totalOrders) * 100) : 0,
    avgOrdersPerPeriod:
      breakdown.length > 0 ? roundMoney(totalOrders / breakdown.length) : 0,
    peakHour: peakHourEntry.hour,
    peakHourOrders: peakHourEntry.count,
    busiestPeriod: busiestPeriod.label,
    busiestPeriodOrders: busiestPeriod.orders,
  };
};

const fillDailyBreakdown = (targetYear, targetMonth, rowMap) => {
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  const breakdown = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const entry = rowMap.get(day) || {
      orders: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
    };
    breakdown.push({
      label: `${MONTH_NAMES[targetMonth - 1]} ${day}`,
      date: new Date(targetYear, targetMonth - 1, day).toISOString().split('T')[0],
      ...entry,
    });
  }
  return breakdown;
};

const buildAnalyticsResponse = async (view, startDate, endDate, breakdown, meta) => {
  const [ordersByStatus, ordersByType, peakHours] = await Promise.all([
    getOrdersByStatus(startDate, endDate),
    getOrdersByType(startDate, endDate),
    getPeakHours(startDate, endDate),
  ]);

  return {
    view,
    breakdown,
    ordersByStatus,
    ordersByType,
    peakHours,
    summary: buildPeriodSummary(breakdown, peakHours),
    ...meta,
  };
};

const getDailyOrderTrends = async (year, month) => {
  const { startDate, endDate, targetYear, targetMonth } = getDateRange('daily', year, month);

  const rows = await getDailyTrendRows(startDate, endDate);
  const rowMap = new Map(
    rows.map((row) => [new Date(row.day).getDate(), mapTrendFields(row)])
  );
  const breakdown = fillDailyBreakdown(targetYear, targetMonth, rowMap);

  return buildAnalyticsResponse('daily', startDate, endDate, breakdown, {
    periodLabel: `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`,
    year: targetYear,
    month: targetMonth,
  });
};

const getMonthlyOrderTrends = async (year) => {
  const { startDate, endDate, targetYear } = getDateRange('monthly', year);

  const rows = await getMonthlyTrendRows(startDate, endDate);
  const rowMap = new Map(
    rows.map((row) => [Number(row.month_num), mapTrendFields(row)])
  );

  const breakdown = [];
  for (let month = 1; month <= 12; month += 1) {
    const entry = rowMap.get(month) || {
      orders: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
    };
    breakdown.push({
      label: MONTH_NAMES[month - 1],
      date: `${targetYear}-${String(month).padStart(2, '0')}`,
      ...entry,
    });
  }

  return buildAnalyticsResponse('monthly', startDate, endDate, breakdown, {
    periodLabel: String(targetYear),
    year: targetYear,
  });
};

const getYearlyOrderTrends = async (yearsBack) => {
  const { startDate, endDate, startYear, currentYear, yearsBack: count } = getDateRange(
    'yearly',
    null,
    null,
    yearsBack
  );

  const rows = await getYearlyTrendRows(startDate, endDate);
  const rowMap = new Map(rows.map((row) => [Number(row.year), mapTrendFields(row)]));

  const breakdown = [];
  for (let yr = startYear; yr <= currentYear; yr += 1) {
    const entry = rowMap.get(yr) || {
      orders: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
    };
    breakdown.push({
      label: String(yr),
      date: String(yr),
      ...entry,
    });
  }

  return buildAnalyticsResponse('yearly', startDate, endDate, breakdown, {
    periodLabel: `${startYear} – ${currentYear}`,
    yearsBack: count,
  });
};

const getOrderTrendsAnalytics = async ({ view = 'daily', year, month, yearsBack }) => {
  switch (view) {
    case 'monthly':
      return getMonthlyOrderTrends(year);
    case 'yearly':
      return getYearlyOrderTrends(yearsBack);
    case 'daily':
    default:
      return getDailyOrderTrends(year, month);
  }
};

module.exports = { getOrderTrendsAnalytics };
