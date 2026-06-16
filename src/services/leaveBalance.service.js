const prisma = require('../config/database');
const {
  LEAVE_ALLOCATIONS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
} = require('../constants/leave.constants');

const calculateLeaveDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < start) {
    throw new Error('End date must be on or after start date');
  }

  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
};

const getYearBounds = (year = new Date().getFullYear()) => ({
  start: new Date(year, 0, 1),
  end: new Date(year + 1, 0, 1),
  year,
});

const normalizeLeaveType = (leaveType) => {
  const normalized = String(leaveType || 'ANNUAL').toUpperCase();
  if (!LEAVE_TYPES.includes(normalized)) {
    throw new Error('Invalid leave type. Use ANNUAL, CASUAL, or MEDICAL.');
  }
  return normalized;
};

const summarizeRequests = (requests) => {
  const summary = LEAVE_TYPES.reduce(
    (acc, type) => {
      acc[type] = { used: 0, pending: 0 };
      return acc;
    },
    {}
  );

  requests.forEach((request) => {
    const type = request.leaveType || 'ANNUAL';
    const days = request.totalDays || calculateLeaveDays(request.startDate, request.endDate);

    if (request.status === 'APPROVED') {
      summary[type].used += days;
    } else if (request.status === 'PENDING') {
      summary[type].pending += days;
    }
  });

  return summary;
};

const buildBalanceForType = (type, used, pending) => {
  const allocated = LEAVE_ALLOCATIONS[type];
  const remaining = allocated - used - pending;

  return {
    type,
    label: LEAVE_TYPE_LABELS[type],
    allocated,
    used,
    pending,
    remaining: Math.max(remaining, 0),
  };
};

const buildBalancesFromSummary = (summary) =>
  LEAVE_TYPES.map((type) =>
    buildBalanceForType(type, summary[type].used, summary[type].pending)
  );

const getEmployeeLeaveRequestsForYear = async (employeeId, year) => {
  const { start, end } = getYearBounds(year);

  return prisma.leaveRequest.findMany({
    where: {
      employeeId,
      startDate: {
        gte: start,
        lt: end,
      },
    },
    orderBy: { appliedAt: 'desc' },
  });
};

const getEmployeeLeaveBalance = async (employeeId, year = new Date().getFullYear()) => {
  const requests = await getEmployeeLeaveRequestsForYear(employeeId, year);
  const summary = summarizeRequests(requests);

  return {
    year,
    balances: buildBalancesFromSummary(summary),
    totals: {
      allocated: Object.values(LEAVE_ALLOCATIONS).reduce((sum, value) => sum + value, 0),
      used: LEAVE_TYPES.reduce((sum, type) => sum + summary[type].used, 0),
      pending: LEAVE_TYPES.reduce((sum, type) => sum + summary[type].pending, 0),
    },
  };
};

const getAllEmployeeLeaveBalances = async (year = new Date().getFullYear()) => {
  const { start, end } = getYearBounds(year);

  const employees = await prisma.employee.findMany({
    where: {
      user: { isActive: true },
    },
    select: {
      employeeId: true,
      fullName: true,
      designation: true,
      user: {
        select: {
          email: true,
          role: true,
        },
      },
      leaveRequests: {
        where: {
          startDate: {
            gte: start,
            lt: end,
          },
        },
        select: {
          leaveType: true,
          totalDays: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      },
    },
    orderBy: { fullName: 'asc' },
  });

  return employees.map((employee) => {
    const summary = summarizeRequests(employee.leaveRequests);

    return {
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      designation: employee.designation,
      email: employee.user.email,
      role: employee.user.role,
      year,
      balances: buildBalancesFromSummary(summary),
    };
  });
};

const validateLeaveRequest = async ({
  employeeId,
  leaveType,
  startDate,
  endDate,
  excludeLeaveId = null,
  year = new Date(startDate).getFullYear(),
}) => {
  const normalizedType = normalizeLeaveType(leaveType);
  const totalDays = calculateLeaveDays(startDate, endDate);
  const requests = await getEmployeeLeaveRequestsForYear(employeeId, year);
  const relevant = excludeLeaveId
    ? requests.filter((request) => request.leaveId !== excludeLeaveId)
    : requests;

  const summary = summarizeRequests(relevant);
  const allocated = LEAVE_ALLOCATIONS[normalizedType];
  const used = summary[normalizedType].used;
  const pending = summary[normalizedType].pending;
  const remaining = allocated - used - pending;

  if (totalDays > remaining) {
    throw new Error(
      `Insufficient ${LEAVE_TYPE_LABELS[normalizedType]} balance. ` +
        `Requested ${totalDays} day(s), but only ${Math.max(remaining, 0)} remaining ` +
        `(${allocated} allocated, ${used} used, ${pending} pending).`
    );
  }

  return {
    leaveType: normalizedType,
    totalDays,
    year,
    remainingAfterRequest: remaining - totalDays,
  };
};

module.exports = {
  calculateLeaveDays,
  getEmployeeLeaveBalance,
  getAllEmployeeLeaveBalances,
  validateLeaveRequest,
  normalizeLeaveType,
  LEAVE_ALLOCATIONS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
};
