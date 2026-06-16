const LEAVE_ALLOCATIONS = {
  ANNUAL: 14,
  CASUAL: 7,
  MEDICAL: 7,
};

const LEAVE_TYPE_LABELS = {
  ANNUAL: 'Annual Leave',
  CASUAL: 'Casual Leave',
  MEDICAL: 'Medical Leave',
};

const LEAVE_TYPES = Object.keys(LEAVE_ALLOCATIONS);

module.exports = {
  LEAVE_ALLOCATIONS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
};
