// JWT 鉴权中间件与令牌签发
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/appError');

/**
 * 鉴权中间件。
 * 核心安全约束:tenant_id 只从这里(JWT 解析)获取,
 * 绝不读取请求 body/query/params 中的 tenant_id,杜绝横向越权。
 */
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new AppError(401, 401, '缺少登录凭证,请先登录'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    // 将可信身份挂载到 req.user,后续业务统一使用 req.user.tenantId
    req.user = {
      userId: payload.sub,            // 用户ID
      tenantId: payload.tenantId,     // 租户ID(唯一可信来源, admin为-1)
      username: payload.username,     // 用户名
      role: payload.role || 'owner',  // 角色: owner/staff/admin
    };
    return next();
  } catch (e) {
    return next(new AppError(401, 401, '登录凭证无效或已过期,请重新登录'));
  }
}

/**
 * 角色守卫中间件(新增,支持多角色)
 * requireRole('admin')    —— 仅管理员通过,其他返回 430 无权限
 * requireRole(['admin','owner']) —— 多角色任一通过
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    if (!req.user) return next(new AppError(401, 401, '未登录'));
    if (!allowed.includes(req.user.role)) {
      // 430 —— 业务上拒绝,前端可据此弹"无权限"
      return res.status(430).json({ code: 430, message: '无权限访问,需要角色: ' + allowed.join('/'), data: null });
    }
    return next();
  };
}

/**
 * 登录成功后签发 JWT。
 * @param {object} user 数据库用户行(含 id / tenant_id / username / role)
 */
function signToken(user) {
  return jwt.sign(
    {
      username: user.username,
      tenantId: user.tenant_id,
      role: user.role || 'owner',
    },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: env.jwtExpiresIn }
  );
}

module.exports = { auth, signToken, requireRole };
