// 权限点校验中间件(基于 RBAC 表)
const { query } = require('../config/db');
const AppError = require('../utils/appError');

/**
 * 校验当前登录用户是否拥有指定权限码。
 * 用法:requirePerm('product:write')
 * 
 * 超级管理员(role=admin)自动通过所有权限校验。
 */
function requirePerm(permCode) {
  return async (req, res, next) => {
    try {
      // 超级管理员 bypass
      if (req.user && req.user.role === 'admin') {
        return next();
      }

      const rows = await query(
        `SELECT 1
         FROM tenant_user u
         JOIN tenant_user_role ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
         JOIN role_permission rp ON rp.role_id = ur.role_id
         WHERE u.id = ? AND u.tenant_id = ? AND rp.perm_code = ?
         LIMIT 1`,
        [req.user.userId, req.user.tenantId, permCode]
      );
      if (!rows.length) {
        return next(new AppError(403, 403, '没有操作权限: ' + permCode));
      }
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = requirePerm;
