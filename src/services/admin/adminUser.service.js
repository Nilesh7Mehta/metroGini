import sql from '../../config/db.js';
import bcrypt from 'bcrypt';
import {
  normalizePermissions,
  formatAdminUser,
  assertAdminPanelRole,
  ADMIN_PANEL_ROLE_FILTER,
  permissionsForStorage,
} from '../../utils/adminUser.util.js';

const BCRYPT_ROUNDS = 10;

const generateUniqueMobile = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const mobile = `9${String(Math.floor(100000000 + Math.random() * 900000000))}`;
    const { rows } = await sql.query(
      `SELECT 1 FROM users WHERE mobile = $1 LIMIT 1`,
      [mobile],
    );
    if (rows.length === 0) return mobile;
  }

  throw { status: 500, message: 'Unable to generate unique mobile number' };
};

const fetchAdminById = async (id) => {
  const { rows } = await sql.query(
    `
    SELECT id, full_name, email, mobile, status, role, permissions
    FROM users
    WHERE id = $1 AND ${ADMIN_PANEL_ROLE_FILTER}
    `,
    [id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: 'Admin user not found' };
  }

  return rows[0];
};

const validateCreatePayload = (body) => {
  const { name, email, password, role } = body;

  if (!name?.trim()) {
    throw { status: 400, message: 'name is required' };
  }
  if (!email?.trim()) {
    throw { status: 400, message: 'email is required' };
  }
  if (!password) {
    throw { status: 400, message: 'password is required' };
  }
  if (String(password).length < 6) {
    throw { status: 400, message: 'password must be at least 6 characters' };
  }
  if (!role?.trim()) {
    throw { status: 400, message: 'role is required' };
  }
  assertAdminPanelRole(String(role).trim());
};

const validateUpdatePayload = (body) => {
  if (body.name !== undefined && !String(body.name).trim()) {
    throw { status: 400, message: 'name cannot be empty' };
  }
  if (body.email !== undefined && !String(body.email).trim()) {
    throw { status: 400, message: 'email cannot be empty' };
  }
  if (body.role !== undefined && !String(body.role).trim()) {
    throw { status: 400, message: 'role cannot be empty' };
  }
  if (body.role !== undefined) {
    assertAdminPanelRole(String(body.role).trim());
  }
  if (body.password !== undefined && String(body.password).length < 6) {
    throw { status: 400, message: 'password must be at least 6 characters' };
  }
};

export const listAdminUsersService = async () => {
  const { rows } = await sql.query(
    `
    SELECT id, full_name, email, status, role, permissions
    FROM users
    WHERE ${ADMIN_PANEL_ROLE_FILTER}
    ORDER BY id ASC
    `,
  );

  return {
    users: rows.map(formatAdminUser),
  };
};

export const createAdminUserService = async (body) => {
  validateCreatePayload(body);

  const name = String(body.name).trim();
  const email = String(body.email).trim().toLowerCase();
  const adminRole = String(body.role).trim();
  const isActive = body.is_active !== false;
  const permissions = permissionsForStorage(adminRole, body.permissions);
  const passwordHash = await bcrypt.hash(String(body.password), BCRYPT_ROUNDS);
  const mobile = await generateUniqueMobile();

  const { rows } = await sql.query(
    `
    INSERT INTO users (
      mobile,
      full_name,
      email,
      user_password,
      role,
      permissions,
      status,
      is_mobile_verified,
      profile_completed
    )
    VALUES ($1, $2, $3, $4, $5::user_role, $6::jsonb, $7, FALSE, TRUE)
    RETURNING id, full_name, email, status, role, permissions
    `,
    [
      mobile,
      name,
      email,
      passwordHash,
      adminRole,
      JSON.stringify(permissions),
      isActive ? 'active' : 'inactive',
    ],
  );

  return formatAdminUser(rows[0]);
};

export const updateAdminUserService = async (id, body) => {
  validateUpdatePayload(body);
  await fetchAdminById(id);

  const fields = [];
  const values = [];

  if (body.name !== undefined) {
    values.push(String(body.name).trim());
    fields.push(`full_name = $${values.length}`);
  }
  if (body.email !== undefined) {
    values.push(String(body.email).trim().toLowerCase());
    fields.push(`email = $${values.length}`);
  }
  if (body.role !== undefined) {
    values.push(String(body.role).trim());
    fields.push(`role = $${values.length}::user_role`);
  }
  if (body.is_active !== undefined) {
    values.push(body.is_active ? 'active' : 'inactive');
    fields.push(`status = $${values.length}`);
  }
  if (body.permissions !== undefined) {
    values.push(JSON.stringify(normalizePermissions(body.permissions)));
    fields.push(`permissions = $${values.length}::jsonb`);
  }
  if (body.password) {
    const passwordHash = await bcrypt.hash(String(body.password), BCRYPT_ROUNDS);
    values.push(passwordHash);
    fields.push(`user_password = $${values.length}`);
  }

  if (fields.length === 0) {
    throw { status: 400, message: 'No valid fields provided to update' };
  }

  values.push(id);
  const { rows } = await sql.query(
    `
    UPDATE users
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${values.length} AND ${ADMIN_PANEL_ROLE_FILTER}
    RETURNING id, full_name, email, status, role, permissions
    `,
    values,
  );

  return formatAdminUser(rows[0]);
};

export const deleteAdminUserService = async (id, requesterId) => {
  if (Number(id) === Number(requesterId)) {
    throw { status: 400, message: 'You cannot delete your own account' };
  }

  await fetchAdminById(id);

  const { rowCount } = await sql.query(
    `DELETE FROM users WHERE id = $1 AND ${ADMIN_PANEL_ROLE_FILTER}`,
    [id],
  );

  if (rowCount === 0) {
    throw { status: 404, message: 'Admin user not found' };
  }
};
