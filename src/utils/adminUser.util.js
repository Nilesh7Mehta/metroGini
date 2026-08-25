export const PERMISSION_LEVELS = ['view', 'update', 'none'];

const PERMISSION_RANK = {
  none: 0,
  view: 1,
  update: 2,
};

export const ADMIN_SIDEBAR_MODULES = [
  'dashboard',
  'growth',
  'marketing',
  'orders',
  'payments',
  'merchants',
  'riders',
  'vendors',
  'issues',
  'help_support',
  'banners',
  'know_about_us',
  'how_we_work',
  'pincodes',
  'coupons',
  'coupon',
  'users',
  'admin_users',
  'cities',
  'services',
  'service_types',
  'shifts',
  'time_slots',
  'config',
];

export const ADMIN_PANEL_ROLES = [
  'admin',
  'accountant',
  'manager',
  'super_admin',
];

export const APP_USER_ROLE = 'user';

export const ADMIN_PANEL_ROLE_FILTER = `role::text = ANY(ARRAY[${ADMIN_PANEL_ROLES.map(
  (role) => `'${role}'`,
).join(', ')}])`;

export const isAdminPanelRole = (role) => ADMIN_PANEL_ROLES.includes(role);

export const isAppUserRole = (role) => role === APP_USER_ROLE;

export const assertAdminPanelRole = (role) => {
  if (!isAdminPanelRole(role)) {
    throw {
      status: 400,
      message: `role must be one of: ${ADMIN_PANEL_ROLES.join(', ')}`,
    };
  }
};

const parsePermissionsInput = (permissions) => {
  if (!permissions) return {};
  if (typeof permissions === 'string') {
    try {
      return JSON.parse(permissions);
    } catch {
      return {};
    }
  }
  if (typeof permissions !== 'object' || Array.isArray(permissions)) {
    return {};
  }
  return permissions;
};

export const normalizePermissions = (permissions = {}) => {
  const parsed = parsePermissionsInput(permissions);
  const normalized = {};

  Object.entries(parsed).forEach(([module, level]) => {
    const key = String(module).trim();
    if (!key) return;
    if (PERMISSION_LEVELS.includes(level)) {
      normalized[key] = level;
    }
  });

  return normalized;
};

/** Store exactly what super admin assigns — no role-based overrides */
export const permissionsForStorage = (_role, permissions = {}) =>
  normalizePermissions(permissions);

/** Return stored permissions as-is for login/profile responses */
export const resolvePermissions = (_role, permissions) =>
  normalizePermissions(permissions);

export const hasModuleAccess = (
  _role,
  permissions,
  module,
  requiredLevel = 'view',
) => {
  const effective = normalizePermissions(permissions);
  const currentLevel = effective[module] || 'none';
  return PERMISSION_RANK[currentLevel] >= PERMISSION_RANK[requiredLevel];
};

export const formatAdminUser = (row) => {
  const role = String(row.role || '').trim();

  return {
    id: Number(row.id),
    name: row.full_name || null,
    email: row.email,
    role,
    is_active: row.status === 'active',
    permissions: resolvePermissions(role, row.permissions),
  };
};

export const formatAdminPublic = (row) => {
  const role = String(row.role || '').trim();

  return {
    id: Number(row.id),
    name: row.full_name || null,
    email: row.email,
    role,
    permissions: resolvePermissions(role, row.permissions),
  };
};
