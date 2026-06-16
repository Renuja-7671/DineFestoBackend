const MORNING_SHIFT_START_HOUR = 6;
const AFTERNOON_SHIFT_START_HOUR = 14;
const AFTERNOON_SHIFT_CUTOFF_HOUR = 14;

const getFlexiGraceMinutes = () => {
  const configured = parseInt(process.env.ATTENDANCE_FLEXI_GRACE_MINUTES, 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : 30;
};

const startOfDay = (date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const getShiftStartTime = (checkInTime, dayStart = startOfDay(checkInTime)) => {
  const shiftStartHour =
    checkInTime.getHours() >= AFTERNOON_SHIFT_CUTOFF_HOUR
      ? AFTERNOON_SHIFT_START_HOUR
      : MORNING_SHIFT_START_HOUR;

  const shiftStartTime = new Date(dayStart);
  shiftStartTime.setHours(shiftStartHour, 0, 0, 0);
  return shiftStartTime;
};

const getLateThresholdTime = (shiftStartTime, graceMinutes = getFlexiGraceMinutes()) =>
  new Date(shiftStartTime.getTime() + graceMinutes * 60 * 1000);

const determineCheckInStatus = (checkInTime, shiftStartTime, graceMinutes = getFlexiGraceMinutes()) => {
  const lateThreshold = getLateThresholdTime(shiftStartTime, graceMinutes);
  return checkInTime.getTime() > lateThreshold.getTime() ? 'LATE' : 'PRESENT';
};

const evaluateCheckInTiming = (checkInTime = new Date()) => {
  const dayStart = startOfDay(checkInTime);
  const graceMinutes = getFlexiGraceMinutes();
  const shiftStartTime = getShiftStartTime(checkInTime, dayStart);
  const lateThresholdTime = getLateThresholdTime(shiftStartTime, graceMinutes);
  const status = determineCheckInStatus(checkInTime, shiftStartTime, graceMinutes);

  return {
    status,
    shiftStartTime,
    lateThresholdTime,
    graceMinutes,
  };
};

const getFlexiHoursPolicy = () => ({
  graceMinutes: getFlexiGraceMinutes(),
  morningShiftStartHour: MORNING_SHIFT_START_HOUR,
  afternoonShiftStartHour: AFTERNOON_SHIFT_START_HOUR,
});

module.exports = {
  MORNING_SHIFT_START_HOUR,
  AFTERNOON_SHIFT_START_HOUR,
  getFlexiGraceMinutes,
  getShiftStartTime,
  getLateThresholdTime,
  determineCheckInStatus,
  evaluateCheckInTiming,
  getFlexiHoursPolicy,
};
