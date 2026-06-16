const ADMIN_PORTAL_ROLES = ['ADMIN', 'MANAGER'];
const STAFF_ROLES = ['WAITER', 'CHEF'];
const EMPLOYEE_CREATABLE_ROLES = ['WAITER', 'CHEF'];

const isAdminPortalRole = (role) => ADMIN_PORTAL_ROLES.includes(role);

module.exports = {
  ADMIN_PORTAL_ROLES,
  STAFF_ROLES,
  EMPLOYEE_CREATABLE_ROLES,
  isAdminPortalRole,
};
