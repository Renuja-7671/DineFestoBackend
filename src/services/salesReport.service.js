const prisma = require('../config/database');

const SALE_STATUSES = ['COMPLETED', 'SERVED'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const buildSummary = (breakdown) => {
  const totalRevenue = breakdown.reduce((sum, row) => sum + row.revenue, 0);
  const totalQuantity = breakdown.reduce((sum, row) => sum + row.quantity, 0);
  const totalOrders = breakdown.reduce((sum, row) => sum + row.orders, 0);
  return {
    totalRevenue: roundMoney(totalRevenue),
    totalQuantity,
    totalOrders,
    averageOrderValue: totalOrders > 0 ? roundMoney(totalRevenue / totalOrders) : 0,
  };
};

const getTopSellingItems = async (startDate, endDate) => {
  const topSellingItems = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: {
      order: {
        createdAt: { gte: startDate, lt: endDate },
        status: { in: SALE_STATUSES },
      },
    },
    _sum: { quantity: true },
    _count: { orderItemId: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  });

  if (topSellingItems.length === 0) return [];

  const menuItemIds = topSellingItems.map((item) => item.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { itemId: { in: menuItemIds } },
    select: {
      itemId: true,
      name: true,
      price: true,
      category: { select: { name: true } },
    },
  });

  return topSellingItems.map((item) => {
    const menuItem = menuItems.find((m) => m.itemId === item.menuItemId);
    const unitPrice = parseFloat(menuItem?.price || 0);
    const quantity = item._sum.quantity || 0;
    return {
      menuItemId: item.menuItemId,
      name: menuItem?.name || 'Unknown',
      category: menuItem?.category?.name || 'Unknown',
      price: unitPrice,
      totalQuantitySold: quantity,
      orderCount: item._count.orderItemId,
      revenue: roundMoney(quantity * unitPrice),
    };
  });
};

const getSalesByCategory = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      c."name" AS category,
      COUNT(DISTINCT o."orderId")::int AS order_count,
      COALESCE(SUM(oi."quantity"), 0)::int AS total_quantity,
      COALESCE(SUM(oi."quantity" * oi."unitPrice"), 0) AS revenue
    FROM "OrderItem" oi
    JOIN "MenuItem" mi ON oi."menuItemId" = mi."itemId"
    JOIN "Category" c ON mi."categoryId" = c."categoryId"
    JOIN "Order" o ON oi."orderId" = o."orderId"
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
    GROUP BY c."name"
    ORDER BY revenue DESC
  `;

  return rows.map((cat) => ({
    category: cat.category,
    orderCount: Number(cat.order_count),
    totalQuantity: Number(cat.total_quantity),
    revenue: roundMoney(Number(cat.revenue)),
  }));
};

const getDailySales = async (year, month) => {
  const now = new Date();
  const targetYear = year ? parseInt(year, 10) : now.getFullYear();
  const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;

  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 1);
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);

  const rows = await prisma.$queryRaw`
    SELECT
      DATE(o."createdAt") AS day,
      COUNT(DISTINCT o."orderId")::int AS orders,
      COALESCE(SUM(oi."quantity"), 0)::int AS quantity,
      COALESCE(SUM(oi."quantity" * oi."unitPrice"), 0) AS revenue
    FROM "Order" o
    JOIN "OrderItem" oi ON oi."orderId" = o."orderId"
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
    GROUP BY DATE(o."createdAt")
    ORDER BY day ASC
  `;

  const rowMap = new Map(
    rows.map((row) => [
      new Date(row.day).getDate(),
      {
        revenue: roundMoney(Number(row.revenue)),
        quantity: Number(row.quantity),
        orders: Number(row.orders),
      },
    ])
  );

  const breakdown = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(targetYear, targetMonth - 1, day);
    const entry = rowMap.get(day) || { revenue: 0, quantity: 0, orders: 0 };
    breakdown.push({
      label: `${MONTH_NAMES[targetMonth - 1]} ${day}`,
      date: date.toISOString().split('T')[0],
      revenue: entry.revenue,
      quantity: entry.quantity,
      orders: entry.orders,
    });
  }

  const [topSellingItems, salesByCategory] = await Promise.all([
    getTopSellingItems(startDate, endDate),
    getSalesByCategory(startDate, endDate),
  ]);

  return {
    view: 'daily',
    periodLabel: `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`,
    year: targetYear,
    month: targetMonth,
    breakdown,
    summary: buildSummary(breakdown),
    topSellingItems,
    salesByCategory,
  };
};

const getMonthlySales = async (year) => {
  const now = new Date();
  const targetYear = year ? parseInt(year, 10) : now.getFullYear();
  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear + 1, 0, 1);

  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(MONTH FROM o."createdAt")::int AS month_num,
      COUNT(DISTINCT o."orderId")::int AS orders,
      COALESCE(SUM(oi."quantity"), 0)::int AS quantity,
      COALESCE(SUM(oi."quantity" * oi."unitPrice"), 0) AS revenue
    FROM "Order" o
    JOIN "OrderItem" oi ON oi."orderId" = o."orderId"
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
    GROUP BY EXTRACT(MONTH FROM o."createdAt")
    ORDER BY month_num ASC
  `;

  const rowMap = new Map(
    rows.map((row) => [
      Number(row.month_num),
      {
        revenue: roundMoney(Number(row.revenue)),
        quantity: Number(row.quantity),
        orders: Number(row.orders),
      },
    ])
  );

  const breakdown = [];
  for (let month = 1; month <= 12; month += 1) {
    const entry = rowMap.get(month) || { revenue: 0, quantity: 0, orders: 0 };
    breakdown.push({
      label: MONTH_NAMES[month - 1],
      date: `${targetYear}-${String(month).padStart(2, '0')}`,
      revenue: entry.revenue,
      quantity: entry.quantity,
      orders: entry.orders,
    });
  }

  const [topSellingItems, salesByCategory] = await Promise.all([
    getTopSellingItems(startDate, endDate),
    getSalesByCategory(startDate, endDate),
  ]);

  return {
    view: 'monthly',
    periodLabel: String(targetYear),
    year: targetYear,
    breakdown,
    summary: buildSummary(breakdown),
    topSellingItems,
    salesByCategory,
  };
};

const getYearlySales = async (yearsBack = 5) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const count = Math.min(Math.max(parseInt(yearsBack, 10) || 5, 1), 10);
  const startYear = currentYear - count + 1;
  const startDate = new Date(startYear, 0, 1);
  const endDate = new Date(currentYear + 1, 0, 1);

  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM o."createdAt")::int AS year,
      COUNT(DISTINCT o."orderId")::int AS orders,
      COALESCE(SUM(oi."quantity"), 0)::int AS quantity,
      COALESCE(SUM(oi."quantity" * oi."unitPrice"), 0) AS revenue
    FROM "Order" o
    JOIN "OrderItem" oi ON oi."orderId" = o."orderId"
    WHERE o."createdAt" >= ${startDate}
      AND o."createdAt" < ${endDate}
      AND o."status" IN ('COMPLETED', 'SERVED')
    GROUP BY EXTRACT(YEAR FROM o."createdAt")
    ORDER BY year ASC
  `;

  const rowMap = new Map(
    rows.map((row) => [
      Number(row.year),
      {
        revenue: roundMoney(Number(row.revenue)),
        quantity: Number(row.quantity),
        orders: Number(row.orders),
      },
    ])
  );

  const breakdown = [];
  for (let year = startYear; year <= currentYear; year += 1) {
    const entry = rowMap.get(year) || { revenue: 0, quantity: 0, orders: 0 };
    breakdown.push({
      label: String(year),
      date: String(year),
      revenue: entry.revenue,
      quantity: entry.quantity,
      orders: entry.orders,
    });
  }

  const [topSellingItems, salesByCategory] = await Promise.all([
    getTopSellingItems(startDate, endDate),
    getSalesByCategory(startDate, endDate),
  ]);

  return {
    view: 'yearly',
    periodLabel: `${startYear} – ${currentYear}`,
    yearsBack: count,
    breakdown,
    summary: buildSummary(breakdown),
    topSellingItems,
    salesByCategory,
  };
};

const getSalesAnalytics = async ({ view = 'daily', year, month, yearsBack }) => {
  switch (view) {
    case 'monthly':
      return getMonthlySales(year);
    case 'yearly':
      return getYearlySales(yearsBack);
    case 'daily':
    default:
      return getDailySales(year, month);
  }
};

module.exports = { getSalesAnalytics };
