const prisma = require('../config/database');

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const roundQty = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

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

const getCurrentSnapshot = async () => {
  const [lowStockItems, inventoryValue, totalItems, allInventory] = await Promise.all([
    prisma.$queryRaw`
      SELECT "inventoryId", "itemName", "quantity", "unit", "reorderLevel", "costPerUnit"
      FROM "InventoryItem"
      WHERE quantity <= "reorderLevel"
      ORDER BY (quantity / NULLIF("reorderLevel", 0)) ASC
    `,
    prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity * "costPerUnit"), 0) AS total_value
      FROM "InventoryItem"
    `,
    prisma.inventoryItem.count(),
    prisma.inventoryItem.findMany({ orderBy: { lastUpdated: 'desc' } }),
  ]);

  const inventoryItems = allInventory.map((item) => {
    const quantity = parseFloat(item.quantity);
    const reorderLevel = parseFloat(item.reorderLevel);
    const costPerUnit = parseFloat(item.costPerUnit);
    return {
      inventoryId: item.inventoryId,
      itemName: item.itemName,
      quantity,
      unit: item.unit,
      reorderLevel,
      costPerUnit,
      totalValue: roundMoney(quantity * costPerUnit),
      status:
        quantity <= reorderLevel
          ? 'Low Stock'
          : quantity <= reorderLevel * 1.5
          ? 'Medium Stock'
          : 'In Stock',
    };
  });

  return {
    totalItems,
    lowStockCount: lowStockItems.length,
    totalInventoryValue: roundMoney(Number(inventoryValue[0]?.total_value || 0)),
    lowStockItems: lowStockItems.map((item) => ({
      inventoryId: item.inventoryId,
      itemName: item.itemName,
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      reorderLevel: parseFloat(item.reorderLevel),
      costPerUnit: parseFloat(item.costPerUnit),
      stockPercentage: parseFloat(item.reorderLevel) > 0
        ? ((parseFloat(item.quantity) / parseFloat(item.reorderLevel)) * 100).toFixed(2)
        : '0',
    })),
    inventoryItems,
  };
};

const getDailyMovementRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      DATE("createdAt") AS day,
      COUNT(*)::int AS movements,
      COALESCE(SUM(CASE WHEN "movementType" = 'ORDER_CONSUMPTION' THEN ABS("quantityChange") ELSE 0 END), 0) AS consumed,
      COALESCE(SUM(CASE WHEN "movementType" = 'STOCK_IN' THEN "quantityChange" ELSE 0 END), 0) AS restocked,
      COALESCE(SUM("quantityChange"), 0) AS net_change
    FROM "InventoryLedger"
    WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDate}
    GROUP BY DATE("createdAt")
    ORDER BY day ASC
  `;

const getMonthlyMovementRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      EXTRACT(MONTH FROM "createdAt")::int AS month_num,
      COUNT(*)::int AS movements,
      COALESCE(SUM(CASE WHEN "movementType" = 'ORDER_CONSUMPTION' THEN ABS("quantityChange") ELSE 0 END), 0) AS consumed,
      COALESCE(SUM(CASE WHEN "movementType" = 'STOCK_IN' THEN "quantityChange" ELSE 0 END), 0) AS restocked,
      COALESCE(SUM("quantityChange"), 0) AS net_change
    FROM "InventoryLedger"
    WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDate}
    GROUP BY EXTRACT(MONTH FROM "createdAt")
    ORDER BY month_num ASC
  `;

const getYearlyMovementRows = (startDate, endDate) =>
  prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM "createdAt")::int AS year,
      COUNT(*)::int AS movements,
      COALESCE(SUM(CASE WHEN "movementType" = 'ORDER_CONSUMPTION' THEN ABS("quantityChange") ELSE 0 END), 0) AS consumed,
      COALESCE(SUM(CASE WHEN "movementType" = 'STOCK_IN' THEN "quantityChange" ELSE 0 END), 0) AS restocked,
      COALESCE(SUM("quantityChange"), 0) AS net_change
    FROM "InventoryLedger"
    WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDate}
    GROUP BY EXTRACT(YEAR FROM "createdAt")
    ORDER BY year ASC
  `;

const mapMovementFields = (row) => ({
  movements: Number(row.movements),
  consumed: roundQty(row.consumed),
  restocked: roundQty(row.restocked),
  netChange: roundQty(row.net_change),
});

const buildPeriodSummary = (breakdown) => ({
  totalMovements: breakdown.reduce((sum, row) => sum + row.movements, 0),
  totalConsumed: roundQty(breakdown.reduce((sum, row) => sum + row.consumed, 0)),
  totalRestocked: roundQty(breakdown.reduce((sum, row) => sum + row.restocked, 0)),
  netChange: roundQty(breakdown.reduce((sum, row) => sum + row.netChange, 0)),
});

const getTopConsumedItems = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      il."inventoryId",
      ii."itemName",
      ii."unit",
      COALESCE(SUM(ABS(il."quantityChange")), 0) AS consumed
    FROM "InventoryLedger" il
    JOIN "InventoryItem" ii ON il."inventoryId" = ii."inventoryId"
    WHERE il."createdAt" >= ${startDate}
      AND il."createdAt" < ${endDate}
      AND il."movementType" = 'ORDER_CONSUMPTION'
    GROUP BY il."inventoryId", ii."itemName", ii."unit"
    ORDER BY consumed DESC
    LIMIT 10
  `;

  return rows.map((row) => ({
    inventoryId: Number(row.inventoryId),
    itemName: row.itemName,
    unit: row.unit,
    consumed: roundQty(row.consumed),
  }));
};

const getMovementsByType = async (startDate, endDate) => {
  const rows = await prisma.$queryRaw`
    SELECT
      "movementType" AS type,
      COUNT(*)::int AS count,
      COALESCE(SUM(ABS("quantityChange")), 0) AS total_quantity
    FROM "InventoryLedger"
    WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDate}
    GROUP BY "movementType"
    ORDER BY count DESC
  `;

  return rows.map((row) => ({
    type: row.type,
    count: Number(row.count),
    totalQuantity: roundQty(row.total_quantity),
  }));
};

const fillDailyBreakdown = (targetYear, targetMonth, rowMap) => {
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  const breakdown = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const entry = rowMap.get(day) || {
      movements: 0,
      consumed: 0,
      restocked: 0,
      netChange: 0,
    };
    breakdown.push({
      label: `${MONTH_NAMES[targetMonth - 1]} ${day}`,
      date: new Date(targetYear, targetMonth - 1, day).toISOString().split('T')[0],
      ...entry,
    });
  }
  return breakdown;
};

const getDailyInventoryAnalytics = async (year, month) => {
  const { startDate, endDate, targetYear, targetMonth } = getDateRange('daily', year, month);

  const [movementRows, snapshot, topConsumed, movementsByType] = await Promise.all([
    getDailyMovementRows(startDate, endDate),
    getCurrentSnapshot(),
    getTopConsumedItems(startDate, endDate),
    getMovementsByType(startDate, endDate),
  ]);

  const rowMap = new Map(
    movementRows.map((row) => [new Date(row.day).getDate(), mapMovementFields(row)])
  );

  const breakdown = fillDailyBreakdown(targetYear, targetMonth, rowMap);

  return {
    view: 'daily',
    periodLabel: `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`,
    year: targetYear,
    month: targetMonth,
    breakdown,
    summary: {
      ...buildPeriodSummary(breakdown),
      ...snapshot,
    },
    topConsumedItems: topConsumed,
    movementsByType,
  };
};

const getMonthlyInventoryAnalytics = async (year) => {
  const { startDate, endDate, targetYear } = getDateRange('monthly', year);

  const [movementRows, snapshot, topConsumed, movementsByType] = await Promise.all([
    getMonthlyMovementRows(startDate, endDate),
    getCurrentSnapshot(),
    getTopConsumedItems(startDate, endDate),
    getMovementsByType(startDate, endDate),
  ]);

  const rowMap = new Map(
    movementRows.map((row) => [Number(row.month_num), mapMovementFields(row)])
  );

  const breakdown = [];
  for (let month = 1; month <= 12; month += 1) {
    const entry = rowMap.get(month) || {
      movements: 0,
      consumed: 0,
      restocked: 0,
      netChange: 0,
    };
    breakdown.push({
      label: MONTH_NAMES[month - 1],
      date: `${targetYear}-${String(month).padStart(2, '0')}`,
      ...entry,
    });
  }

  return {
    view: 'monthly',
    periodLabel: String(targetYear),
    year: targetYear,
    breakdown,
    summary: {
      ...buildPeriodSummary(breakdown),
      ...snapshot,
    },
    topConsumedItems: topConsumed,
    movementsByType,
  };
};

const getYearlyInventoryAnalytics = async (yearsBack) => {
  const { startDate, endDate, startYear, currentYear, yearsBack: count } = getDateRange(
    'yearly',
    null,
    null,
    yearsBack
  );

  const [movementRows, snapshot, topConsumed, movementsByType] = await Promise.all([
    getYearlyMovementRows(startDate, endDate),
    getCurrentSnapshot(),
    getTopConsumedItems(startDate, endDate),
    getMovementsByType(startDate, endDate),
  ]);

  const rowMap = new Map(
    movementRows.map((row) => [Number(row.year), mapMovementFields(row)])
  );

  const breakdown = [];
  for (let yr = startYear; yr <= currentYear; yr += 1) {
    const entry = rowMap.get(yr) || {
      movements: 0,
      consumed: 0,
      restocked: 0,
      netChange: 0,
    };
    breakdown.push({
      label: String(yr),
      date: String(yr),
      ...entry,
    });
  }

  return {
    view: 'yearly',
    periodLabel: `${startYear} – ${currentYear}`,
    yearsBack: count,
    breakdown,
    summary: {
      ...buildPeriodSummary(breakdown),
      ...snapshot,
    },
    topConsumedItems: topConsumed,
    movementsByType,
  };
};

const getInventoryAnalytics = async ({ view = 'daily', year, month, yearsBack }) => {
  switch (view) {
    case 'monthly':
      return getMonthlyInventoryAnalytics(year);
    case 'yearly':
      return getYearlyInventoryAnalytics(yearsBack);
    case 'daily':
    default:
      return getDailyInventoryAnalytics(year, month);
  }
};

module.exports = { getInventoryAnalytics };
