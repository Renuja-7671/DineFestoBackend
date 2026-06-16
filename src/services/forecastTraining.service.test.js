const { fillMissingDays, generateForecast } = require('./forecastTraining.service');

describe('forecastTraining.service', () => {
  describe('fillMissingDays', () => {
    it('fills gaps with zero revenue days', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(today);
      start.setDate(start.getDate() - 2);

      const sales = [
        { date: new Date(start), amount: 100 },
        { date: new Date(today), amount: 200 },
      ];

      const filled = fillMissingDays(sales);

      expect(filled).toHaveLength(3);
      expect(filled[1].amount).toBe(0);
      expect(filled[2].amount).toBe(200);
    });
  });

  describe('generateForecast', () => {
    it('returns the requested number of future rows', () => {
      const series = [];

      for (let day = 1; day <= 21; day += 1) {
        series.push({
          date: new Date(2026, 0, day),
          amount: 100 + day * 5,
        });
      }

      const forecast = generateForecast(series, 7);

      expect(forecast).toHaveLength(7);
      expect(forecast[0].predictedRevenue).toBeGreaterThanOrEqual(0);
      expect(forecast[0].lowerBoundRevenue).toBeLessThanOrEqual(forecast[0].predictedRevenue);
      expect(forecast[0].upperBoundRevenue).toBeGreaterThanOrEqual(forecast[0].predictedRevenue);
    });
  });
});
