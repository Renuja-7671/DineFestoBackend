const {
  determineCheckInStatus,
  evaluateCheckInTiming,
  getLateThresholdTime,
  getShiftStartTime,
} = require('./attendanceSchedule.service');

describe('attendanceSchedule.service', () => {
  const atLocalTime = (year, month, day, hour, minute = 0) =>
    new Date(year, month - 1, day, hour, minute, 0, 0);

  it('marks morning check-in on time until 30 minutes after 6:00 AM', () => {
    const dayStart = atLocalTime(2026, 6, 10, 0);
    const shiftStart = getShiftStartTime(atLocalTime(2026, 6, 10, 6), dayStart);

    expect(determineCheckInStatus(atLocalTime(2026, 6, 10, 5, 45), shiftStart, 30)).toBe('PRESENT');
    expect(determineCheckInStatus(atLocalTime(2026, 6, 10, 6, 0), shiftStart, 30)).toBe('PRESENT');
    expect(determineCheckInStatus(atLocalTime(2026, 6, 10, 6, 30), shiftStart, 30)).toBe('PRESENT');
    expect(determineCheckInStatus(atLocalTime(2026, 6, 10, 6, 31), shiftStart, 30)).toBe('LATE');
  });

  it('uses afternoon shift start at 2:00 PM with the same grace window', () => {
    const evaluation = evaluateCheckInTiming(atLocalTime(2026, 6, 10, 14, 20));

    expect(evaluation.shiftStartTime.getHours()).toBe(14);
    expect(evaluation.lateThresholdTime.getHours()).toBe(14);
    expect(evaluation.lateThresholdTime.getMinutes()).toBe(30);
    expect(evaluation.status).toBe('PRESENT');
  });

  it('builds late threshold by adding grace minutes to shift start', () => {
    const shiftStart = atLocalTime(2026, 6, 10, 6, 0);
    const threshold = getLateThresholdTime(shiftStart, 30);

    expect(threshold.getHours()).toBe(6);
    expect(threshold.getMinutes()).toBe(30);
  });
});
