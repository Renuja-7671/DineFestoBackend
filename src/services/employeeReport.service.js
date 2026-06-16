const prisma = require('../config/database');

const ORDER_STATUSES = ['COMPLETED', 'SERVED'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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

const mapPerformanceFields = (row) => ({
  orders: Number(row.orders),
  activeEmployees: Number(row.active_employees),
  revenue: roundMoney(row.revenue),
});

const getDailyPerformanceRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      DATE(o."createdAt") AS day,
      COUNT(*)::int AS orders,
      COUNT(DISTINCT o."staffId")::int AS active_employees,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
      AND o."staffId" IS NOT NULL
    GROUP BY DATE(o."createdAt")
    ORDER BY day ASC
  `;

const getMonthlyPerformanceRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      EXTRACT(MONTH FROM o."createdAt")::int AS month_num,
      COUNT(*)::int AS orders,
      COUNT(DISTINCT o."staffId")::int AS active_employees,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
      AND o."staffId" IS NOT NULL
    GROUP BY EXTRACT(MONTH FROM o."createdAt")
    ORDER BY month_num ASC
  `;

const getYearlyPerformanceRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM o."createdAt")::int AS year,
      COUNT(*)::int AS orders,
      COUNT(DISTINCT o."staffId")::int AS active_employees,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
      AND o."staffId" IS NOT NULL
    GROUP BY EXTRACT(YEAR FROM o."createdAt")
    ORDER BY year ASC
  `;

const buildPeriodSummary = (breakdown) => ({
  totalOrders: breakdown.reduce((sum, row) => sum + row.orders, 0),
  totalRevenue: roundMoney(breakdown.reduce((sum, row) => sum + row.revenue, 0)),
  peakActiveEmployees: breakdown.reduce(
    (max, row) => Math.max(max, row.activeEmployees),
    0
  ),
  avgOrdersPerPeriod:
    breakdown.length > 0
      ? roundMoney(breakdown.reduce((sum, row) => sum + row.orders, 0) / breakdown.length)
      : 0,
});

const getCurrentSnapshot = async () => {
  const [totalEmployees, roleRows] = await Promise.all([
    prisma.employee.count({
      where: { user: { isActive: true } },
    }),
    prisma.$queryRaw`
      SELECT u."role" AS role, COUNT(*)::int AS count
      FROM "Employee" e
      JOIN "User" u ON e."userId" = u."userId"
      WHERE u."isActive" = true
      GROUP BY u."role"
      ORDER BY count DESC
    `,
  ]);

  return {
    totalEmployees,
    employeesByRole: roleRows.map((row) => ({
      role: row.role,
      count: Number(row.count),
    })),
  };
};

const getTopPerformers = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      e."employeeId",
      e."fullName",
      e."designation",
      u."role" AS role,
      COUNT(*)::int AS orders_processed,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    JOIN "Employee" e ON o."staffId" = e."employeeId"
    JOIN "User" u ON e."userId" = u."userId"
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
    GROUP BY e."employeeId", e."fullName", e."designation", u."role"
    ORDER BY orders_processed DESC, revenue DESC
    LIMIT 10
  `;

  return rows.map((row) => ({
    employeeId: Number(row.employeeId),
    name: row.fullName,
    designation: row.designation,
    role: row.role,
    ordersProcessed: Number(row.orders_processed),
    totalRevenue: roundMoney(row.revenue),
  }));
};

const getPerformanceByRole = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      u."role" AS role,
      COUNT(DISTINCT e."employeeId")::int AS employees,
      COUNT(*)::int AS orders,
      COALESCE(SUM(o."totalAmount"), 0) AS revenue
    FROM "Order" o
    JOIN "Employee" e ON o."staffId" = e."employeeId"
    JOIN "User" u ON e."userId" = u."userId"
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
    GROUP BY u."role"
    ORDER BY orders DESC
  `;

  return rows.map((row) => ({
    role: row.role,
    employees: Number(row.employees),
    orders: Number(row.orders),
    revenue: roundMoney(row.revenue),
  }));
};

const fillDailyBreakdown = (targetYear, targetMonth, rowMap) => {
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  const breakdown = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const entry = rowMap.get(day) || { orders: 0, activeEmployees: 0, revenue: 0 };
    breakdown.push({
      label: `${MONTH_NAMES[targetMonth - 1]} ${day}`,
      date: new Date(targetYear, targetMonth - 1, day).toISOString().split('T')[0],
      ...entry,
    });
  }
  return breakdown;
};

const getActiveEmployeesInPeriod = async (startDate, endDate) => {
  const result = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT o."staffId")::int AS count
    FROM "Order" o
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
      AND o."staffId" IS NOT NULL
  `;
  return Number(result[0]?.count || 0);
};

const buildAnalyticsResponse = async (view, startDate, endDate, breakdown, meta) => {
  const [snapshot, topPerformers, performanceByRole, activeEmployeesInPeriod] =
    await Promise.all([
      getCurrentSnapshot(),
      getTopPerformers(startDate, endDate),
      getPerformanceByRole(startDate, endDate),
      getActiveEmployeesInPeriod(startDate, endDate),
    ]);

  const periodSummary = buildPeriodSummary(breakdown);

  return {
    view,
    breakdown,
    topPerformers,
    performanceByRole,
    summary: {
      ...snapshot,
      ...periodSummary,
      activeEmployeesInPeriod,
    },
    ...meta,
  };
};

const getDailyEmployeeAnalytics = async (year, month) => {
  const { startDate, endDate, targetYear, targetMonth } = getDateRange('daily', year, month);

  const rows = await getDailyPerformanceRows(startDate, endDate);
  const rowMap = new Map(
    rows.map((row) => [new Date(row.day).getDate(), mapPerformanceFields(row)])
  );
  const breakdown = fillDailyBreakdown(targetYear, targetMonth, rowMap);

  return buildAnalyticsResponse('daily', startDate, endDate, breakdown, {
    periodLabel: `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`,
    year: targetYear,
    month: targetMonth,
  });
};

const getMonthlyEmployeeAnalytics = async (year) => {
  const { startDate, endDate, targetYear } = getDateRange('monthly', year);

  const rows = await getMonthlyPerformanceRows(startDate, endDate);
  const rowMap = new Map(
    rows.map((row) => [Number(row.month_num), mapPerformanceFields(row)])
  );

  const breakdown = [];
  for (let month = 1; month <= 12; month += 1) {
    const entry = rowMap.get(month) || { orders: 0, activeEmployees: 0, revenue: 0 };
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

const getYearlyEmployeeAnalytics = async (yearsBack) => {
  const { startDate, endDate, startYear, currentYear, yearsBack: count } = getDateRange(
    'yearly',
    null,
    null,
    yearsBack
  );

  const rows = await getYearlyPerformanceRows(startDate, endDate);
  const rowMap = new Map(rows.map((row) => [Number(row.year), mapPerformanceFields(row)]));

  const breakdown = [];
  for (let yr = startYear; yr <= currentYear; yr += 1) {
    const entry = rowMap.get(yr) || { orders: 0, activeEmployees: 0, revenue: 0 };
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

const getEmployeeAnalytics = async ({ view = 'daily', year, month, yearsBack }) => {
  switch (view) {
    case 'monthly':
      return getMonthlyEmployeeAnalytics(year);
    case 'yearly':
      return getYearlyEmployeeAnalytics(yearsBack);
    case 'daily':
    default:
      return getDailyEmployeeAnalytics(year, month);
  }
};

module.exports = { getEmployeeAnalytics };
