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
  'coupons',
  'users',
  'cities',
  'services',
  'service_types',
  'shifts',
  'time_slots',
  'config',
];

export const getFullAccessPermissions = () =>
  Object.fromEntries(
    ADMIN_SIDEBAR_MODULES.map((module) => [module, 'update']),
  );

export const FULL_ACCESS_ROLES = ['admin', 'super_admin'];

export const isFullAccessAdmin = (role) =>
  FULL_ACCESS_ROLES.includes(String(role || '').trim());

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

export const permissionsForStorage = (role, permissions = {}) => {
  if (isFullAccessAdmin(role)) return {};
  return normalizePermissions(permissions);
};

export const resolvePermissions = (role, permissions) => {
  const normalizedRole = String(role || '').trim();
  const stored = normalizePermissions(permissions);

  if (isFullAccessAdmin(normalizedRole)) {
    return Object.keys(stored).length > 0 ? stored : getFullAccessPermissions();
  }

  return stored;
};

export const hasModuleAccess = (
  role,
  permissions,
  module,
  requiredLevel = 'view',
) => {
  if (isFullAccessAdmin(role)) return true;

  const effective = resolvePermissions(role, permissions);
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
