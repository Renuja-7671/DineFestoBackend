const { formatDateKey, toLocalDate, addDays } = require('./date.utils');

describe('date.utils', () => {
  test('formatDateKey uses local calendar date', () => {
    const date = new Date(2026, 5, 11, 15, 30, 0);
    expect(formatDateKey(date)).toBe('2026-06-11');
  });

  test('addDays preserves local date math', () => {
    const start = toLocalDate(new Date(2026, 5, 11));
    const result = addDays(start, 7);
    expect(formatDateKey(result)).toBe('2026-06-18');
  });
});
