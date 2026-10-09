// 业务操作审计日志 Controller — 仅管理员可查询
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { query } = require('../config/db');

/**
 * GET /api/admin/operation-log
 * 管理员分页查询操作日志, 支持按租户/用户/方法/路径/时间过滤
 * 管理员可传 tenant_id 查任意租户; 不传则查全部租户
 */
exports.getList = [
  require('../middlewares/auth').auth,
  require('../middlewares/auth').requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { tenant_id, user_id, method, path: qpath, start_date, end_date, page, pageSize } = req.query;
    const p = Number(page) || 1;
    const ps = Number(pageSize) || 20;
    const where = [];
    const args = [];
    if (tenant_id) { where.push('tenant_id = ?'); args.push(Number(tenant_id)); }
    if (user_id) { where.push('user_id = ?'); args.push(Number(user_id)); }
    if (method) { where.push('method = ?'); args.push(String(method).toUpperCase()); }
    if (qpath) { where.push('path LIKE ?'); args.push('%' + String(qpath) + '%'); }
    if (start_date) { where.push('create_time >= ?'); args.push(start_date); }
    if (end_date) { where.push('create_time < ?'); args.push(end_date); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const countRows = await query(`SELECT COUNT(*) AS total FROM operation_log ${whereSql}`, args);
    const total = countRows[0].total;
    const list = await query(
      `SELECT id, tenant_id, user_id, username, method, path, perm_code, status_code, duration_ms, ip, create_time
       FROM operation_log ${whereSql}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, ps, (p - 1) * ps]
    );
    return ok(res, { list, total, page: p, pageSize: ps });
  }),
];
