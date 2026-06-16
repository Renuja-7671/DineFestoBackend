/**
 * Date helpers for forecast/report queries.
 * Uses local calendar dates to avoid UTC off-by-one issues with @db.Date fields.
 */

const toLocalDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const formatDateKey = (value) => {
  const date = toLocalDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (value, days) => {
  const date = toLocalDate(value);
  date.setDate(date.getDate() + days);
  return date;
};

module.exports = {
  toLocalDate,
  formatDateKey,
  addDays,
};
