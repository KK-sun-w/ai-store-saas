// 业务操作审计日志中间件
// 在 res.on('finish') 时用 setImmediate 异步插入 operation_log, 不阻塞响应
// 复用 req.user.tenantId/userId/username(由 auth 中间件注入)
const { query } = require('../config/db');
const { logger } = require('../utils/logger');

// 只记录有意义的写操作(POST/PUT/PATCH/DELETE), 不记录 GET 查询与静态资源
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function operationLog(req, res, next) {
  const start = Date.now();
  // 在响应结束时异步写入审计日志
  res.on('finish', () => {
    // 跳过 GET/静态资源/健康检查
    if (!WRITE_METHODS.has(req.method)) return;
    if (req.path === '/health') return;

    const duration = Date.now() - start;
    const user = req.user || {};
    setImmediate(async () => {
      try {
        await query(
          `INSERT INTO operation_log
             (tenant_id, user_id, username, method, path, perm_code, status_code, duration_ms, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.tenantId ?? 0,
            user.userId ?? null,
            user.username ?? null,
            req.method,
            (req.originalUrl || req.path || '').slice(0, 255),
            req.permCode ?? null,
            res.statusCode,
            duration,
            (req.ip || req.socket?.remoteAddress || '').slice(0, 45),
          ]
        );
      } catch (e) {
        // 审计日志写失败不得影响业务, 仅记日志
        logger.error('[operationLog] 写入失败', e.message);
      }
    });
  });
  next();
}

module.exports = operationLog;
