const prisma = require('../config/database');
const { formatDateKey, toLocalDate } = require('../utils/date.utils');

const roundMoney = (value) => Math.round(Math.max(value, 0) * 100) / 100;

const getDailySales = async () => {
  const rows = await prisma.$queryRaw`
    SELECT DATE("createdAt") as date, SUM("totalAmount")::float as amount
    FROM "Order"
    WHERE "status" IN ('COMPLETED', 'SERVED')
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  return rows.map((row) => ({
    date: toLocalDate(row.date),
    amount: parseFloat(row.amount || 0),
  }));
};

const fillMissingDays = (sales) => {
  if (!sales.length) {
    return [];
  }

  const amountByDate = new Map(sales.map((row) => [formatDateKey(row.date), row.amount]));
  const start = toLocalDate(sales[0].date);
  const end = toLocalDate(new Date());
  const filled = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = toLocalDate(cursor);
    filled.push({
      date,
      amount: amountByDate.get(formatDateKey(date)) ?? 0,
    });
  }

  return filled;
};

const computeDayOfWeekFactors = (series) => {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);

  for (const point of series) {
    const day = point.date.getDay();
    sums[day] += point.amount;
    counts[day] += 1;
  }

  const averages = sums.map((sum, index) => (counts[index] ? sum / counts[index] : 0));
  const overallAverage =
    series.reduce((total, point) => total + point.amount, 0) / Math.max(series.length, 1);

  if (overallAverage <= 0) {
    return Array(7).fill(1);
  }

  return averages.map((avg) => (avg > 0 ? avg / overallAverage : 1));
};

const linearTrend = (series) => {
  const n = series.length;
  if (n < 2) {
    return { slope: 0, intercept: series[0]?.amount ?? 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += series[i].amount;
    sumXY += i * series[i].amount;
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
};

const standardDeviation = (values) => {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);

  return Math.sqrt(variance);
};

const generateForecast = (series, periods) => {
  const dayOfWeekFactors = computeDayOfWeekFactors(series);
  const recentWindow = series.slice(-Math.min(60, series.length));
  const { slope, intercept } = linearTrend(recentWindow);
  const residuals = recentWindow.map(
    (point, index) => point.amount - (intercept + slope * index)
  );
  const spread = standardDeviation(residuals);
  const overallAverage =
    series.reduce((total, point) => total + point.amount, 0) / Math.max(series.length, 1);
  const lastHistoricalDate = series[series.length - 1].date;
  const baseIndex = recentWindow.length - 1;
  const forecasts = [];

  for (let offset = 1; offset <= periods; offset += 1) {
    const forecastDate = toLocalDate(lastHistoricalDate);
    forecastDate.setDate(forecastDate.getDate() + offset);

    const dayOfWeek = forecastDate.getDay();
    const trendValue = intercept + slope * (baseIndex + offset);
    const seasonalValue = overallAverage * dayOfWeekFactors[dayOfWeek];
    const predicted = Math.max(0, trendValue * 0.5 + seasonalValue * 0.5);

    forecasts.push({
      forecastDate,
      predictedRevenue: roundMoney(predicted),
      lowerBoundRevenue: roundMoney(Math.max(0, predicted - 1.96 * spread)),
      upperBoundRevenue: roundMoney(predicted + 1.96 * spread),
    });
  }

  return forecasts;
};

const runForecastTraining = async () => {
  const forecastDays = Number.parseInt(process.env.FORECAST_DAYS || '30', 10);
  const modelVersion = process.env.FORECAST_MODEL_VERSION || 'prophet-v1';
  const generatedAt = new Date();

  const sales = fillMissingDays(await getDailySales());

  if (!sales.length) {
    throw new Error('No historical sales data found');
  }

  if (sales.length < 14) {
    throw new Error('Not enough historical sales data (need at least 14 days)');
  }

  const forecastRows = generateForecast(sales, forecastDays);

  if (!forecastRows.length) {
    throw new Error('Forecast generation produced no rows');
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesForecast.deleteMany({ where: { modelVersion } });
    await tx.salesForecast.createMany({
      data: forecastRows.map((row) => ({
        forecastDate: row.forecastDate,
        predictedRevenue: row.predictedRevenue,
        lowerBoundRevenue: row.lowerBoundRevenue,
        upperBoundRevenue: row.upperBoundRevenue,
        modelVersion,
        generatedAt,
      })),
    });
  });

  const lastHistoricalDate = sales[sales.length - 1].date;

  return {
    modelVersion,
    forecastDays,
    rowsUpserted: forecastRows.length,
    historyThrough: formatDateKey(lastHistoricalDate),
    forecastFrom: formatDateKey(forecastRows[0].forecastDate),
    forecastTo: formatDateKey(forecastRows[forecastRows.length - 1].forecastDate),
    generatedAt: generatedAt.toISOString(),
  };
};

module.exports = {
  fillMissingDays,
  generateForecast,
  runForecastTraining,
};
