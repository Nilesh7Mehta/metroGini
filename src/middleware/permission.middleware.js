import sql from '../config/db.js';
import {
  hasModuleAccess,
  resolvePermissions,
} from '../utils/adminUser.util.js';

export const requirePermission = (module, requiredLevel = 'view') => {
  return async (req, res, next) => {
    try {
      const role = req.user?.role;

      if (!role) {
        return res.status(401).json({
          success: false,
          message: 'Access token missing or invalid format',
        });
      }

      let permissions = req.adminPermissions;
      if (!permissions) {
        const { rows } = await sql.query(
          `SELECT role, permissions FROM users WHERE id = $1`,
          [req.user.id],
        );

        if (rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Invalid access',
          });
        }

        permissions = resolvePermissions(rows[0].role, rows[0].permissions);
        req.adminPermissions = permissions;
      }

      if (!hasModuleAccess(role, permissions, module, requiredLevel)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this resource',
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
};
