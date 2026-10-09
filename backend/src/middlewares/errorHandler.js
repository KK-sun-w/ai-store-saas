// 全局统一异常处理与 404 处理
const AppError = require('../utils/appError');
const { logger } = require('../utils/logger');

// 统一异常处理(必须注册为最后一个中间件,4 个参数)
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // 业务异常:直接按预设状态码与提示返回,不记 error 日志(只记 warn)
  if (err instanceof AppError) {
    logger.warn(`[AppError] ${err.code} ${req.method} ${req.originalUrl} - ${err.message}`);
    return res.status(err.status).json({ code: err.code, message: err.message, data: null });
  }

  // JWT 相关错误统一视为未认证
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
    logger.warn(`[Auth] ${req.method} ${req.originalUrl} - ${err.message}`);
    return res.status(401).json({ code: 401, message: '登录状态无效或已过期,请重新登录', data: null });
  }

  // 其余异常:写 error 日志(含堆栈), 对外隐藏内部细节
  logger.error(`[UnhandledError] ${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });
  return res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
}

// 404 处理
function notFound(req, res) {
  return res.status(404).json({ code: 404, message: '接口不存在', data: null });
}

module.exports = { errorHandler, notFound };
