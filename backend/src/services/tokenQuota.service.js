// 租户月度 Token 配额服务
// tenant_token_quota 表: tenant_id, quota_month(YYYY-MM), token_limit, token_used
// 核心约束: token_limit=0 表示不限量; 使用乐观锁(CAS)防止并发超扣
const { query } = require('../config/db');
const AppError = require('../utils/appError');
const { getAgentTokenQuota } = require('../utils/tokenQuota');

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** 确保本月额度记录存在,不存在则插入默认额度 */
async function ensureMonthRecord(tenantId) {
  const month = currentMonth();
  await query(
    `INSERT IGNORE INTO tenant_token_quota (tenant_id, quota_month, token_limit, token_used)
     VALUES (?, ?, 0, 0)`,
    [tenantId, month]
  );
  return month;
}

/** 查询本月额度(不扣减) */
async function getMonthQuota(tenantId) {
  const month = await ensureMonthRecord(tenantId);
  const rows = await query(
    'SELECT tenant_id, quota_month, token_limit, token_used FROM tenant_token_quota WHERE tenant_id = ? AND quota_month = ? LIMIT 1',
    [tenantId, month]
  );
  const rec = rows[0];
  return {
    tenantId: rec.tenant_id,
    quotaMonth: rec.quota_month,
    tokenLimit: rec.token_limit,
    tokenUsed: rec.token_used,
    remaining: rec.token_limit === 0 ? Infinity : rec.token_limit - rec.token_used,
    unlimited: rec.token_limit === 0,
  };
}

/** 检查是否超额(不扣减) */
async function checkQuota(tenantId, willUse = 0) {
  const q = await getMonthQuota(tenantId);
  if (q.unlimited) return { ok: true, quota: q };
  if (q.tokenUsed + willUse > q.tokenLimit) {
    return { ok: false, quota: q };
  }
  return { ok: true, quota: q };
}

/** 消费 token (CAS 乐观锁 + 有限重试) */
async function consumeTokens(tenantId, tokenCount) {
  if (!tokenCount || tokenCount <= 0) return;
  const month = await ensureMonthRecord(tenantId);
  const maxRetry = 5;

  for (let i = 0; i < maxRetry; i++) {
    const rows = await query(
      'SELECT id, token_limit, token_used FROM tenant_token_quota WHERE tenant_id = ? AND quota_month = ? LIMIT 1',
      [tenantId, month]
    );
    const rec = rows[0];
    if (!rec) throw new AppError(500, 500, 'Token 额度记录初始化失败');

    // 不限量直接加
    if (rec.token_limit === 0) {
      await query(
        'UPDATE tenant_token_quota SET token_used = token_used + ? WHERE id = ?',
        [tokenCount, rec.id]
      );
      return { used: rec.token_used + tokenCount, limit: 0 };
    }

    // 超限判断
    if (rec.token_used + tokenCount > rec.token_limit) {
      throw new AppError(429, 429, `本月 Token 额度已用完 (${rec.token_used}/${rec.token_limit})`);
    }

    // CAS 更新
    const result = await query(
      `UPDATE tenant_token_quota
       SET token_used = token_used + ?
       WHERE id = ? AND token_used = ?`,
      [tokenCount, rec.id, rec.token_used]
    );

    if (result.affectedRows === 1) {
      return { used: rec.token_used + tokenCount, limit: rec.token_limit };
    }
  }

  throw new AppError(500, 500, 'Token 消费并发冲突, 请重试');
}

/** 管理员: 设置某租户某月的 token 额度 */
async function adminSetQuota(tenantId, quotaMonth, tokenLimit) {
  const month = quotaMonth || currentMonth();
  await query(
    `INSERT INTO tenant_token_quota (tenant_id, quota_month, token_limit, token_used)
     VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE token_limit = ?`,
    [tenantId, month, tokenLimit, tokenLimit]
  );
  return getMonthQuota(tenantId);
}

/** 管理员: 统计所有租户的 token 使用情况 */
async function adminStats(params = {}) {
  const month = params.month || currentMonth();
  const { page = 1, pageSize = 20, tenantId } = params;

  const where = ['tq.quota_month = ?'];
  const args = [month];
  if (tenantId) { where.push('tq.tenant_id = ?'); args.push(tenantId); }

  const countSql = `SELECT COUNT(*) as total FROM tenant_token_quota tq WHERE ${where.join(' AND ')}`;
  const total = (await query(countSql, args))[0].total;

  const offset = (page - 1) * pageSize;
  const listSql = `
    SELECT tq.tenant_id, t.merchant_name, t.store_name,
           tq.quota_month, tq.token_limit, tq.token_used,
           (tq.token_limit - tq.token_used) as token_remaining,
           CASE WHEN tq.token_limit = 0 THEN 1 ELSE 0 END as unlimited,
           (SELECT COUNT(*) FROM ai_agent_task_log l WHERE l.tenant_id = tq.tenant_id) as total_calls
    FROM tenant_token_quota tq
    LEFT JOIN tenant t ON t.id = tq.tenant_id
    WHERE ${where.join(' AND ')}
    ORDER BY tq.tenant_id
    LIMIT ? OFFSET ?
  `;
  const list = await query(listSql, [...args, pageSize, offset]);

  const sumSql = `
    SELECT COALESCE(SUM(token_used),0) as total_used,
           COALESCE(SUM(CASE WHEN token_limit > 0 THEN token_limit ELSE 0 END),0) as total_limit,
           COUNT(*) as tenant_count
    FROM tenant_token_quota tq WHERE ${where.join(' AND ')}
  `;
  const summary = (await query(sumSql, args))[0];

  return {
    month,
    list: list.map(r => ({
      tenantId: r.tenant_id,
      merchantName: r.merchant_name,
      storeName: r.store_name,
      quotaMonth: r.quota_month,
      tokenLimit: r.token_limit,
      tokenUsed: r.token_used,
      tokenRemaining: r.unlimited ? Infinity : r.token_remaining,
      unlimited: !!r.unlimited,
      usageRate: r.token_limit > 0 ? Math.round(r.token_used / r.token_limit * 10000) / 100 : 0,
      totalCalls: r.total_calls,
    })),
    summary: {
      month,
      totalUsed: summary.total_used,
      totalLimit: summary.total_limit,
      tenantCount: summary.tenant_count,
    },
    pagination: { page: Number(page), pageSize: Number(pageSize), total },
  };
}

/**
 * 管理员: 给租户赠送/调整 Agent Token 额度
 * 直接修改 ai_quota.agent_token_total (累加或覆盖)
 * @param {number} tenantId
 * @param {number} grantToken 赠送/调整的token数(正数=增加, 负数=减少)
 */
async function adminGrantAgentToken(tenantId, grantToken) {
  const token = Number(grantToken);
  if (isNaN(token)) throw new AppError(400, 400, 'grantToken 必须为数字');
  // 确保记录存在
  await query(
    `INSERT IGNORE INTO ai_quota (tenant_id, agent_token_total, agent_token_used)
     VALUES (?, 0, 0)`,
    [tenantId]
  );
  // 原子调整总额度(支持正负)
  await query(
    'UPDATE ai_quota SET agent_token_total = agent_token_total + ? WHERE tenant_id = ?',
    [token, tenantId]
  );
  return getAgentTokenQuota(tenantId);
}

/**
 * 管理员: 分页查询 Token 对账流水
 * 支持按 tenant_id 筛选
 */
async function adminQueryTokenBills(params = {}) {
  const { page = 1, pageSize = 20, tenantId, scene, startDate, endDate } = params;
  const where = ['1=1'];
  const args = [];
  if (tenantId) { where.push('b.tenant_id = ?'); args.push(Number(tenantId)); }
  if (scene) { where.push('b.scene = ?'); args.push(scene); }
  if (startDate) { where.push('b.create_time >= ?'); args.push(startDate); }
  if (endDate) { where.push('b.create_time <= ?'); args.push(endDate); }

  const whereSql = where.join(' AND ');
  const countSql = `SELECT COUNT(*) as total FROM ai_token_bill b WHERE ${whereSql}`;
  const total = (await query(countSql, args))[0].total;

  const offset = (page - 1) * pageSize;
  const listSql = `
    SELECT b.id, b.tenant_id, t.merchant_name, t.store_name,
           b.user_id, b.prompt_tokens, b.completion_tokens, b.total_tokens,
           b.scene, b.remark, b.create_time
    FROM ai_token_bill b
    LEFT JOIN tenant t ON t.id = b.tenant_id
    WHERE ${whereSql}
    ORDER BY b.id DESC
    LIMIT ? OFFSET ?
  `;
  const list = await query(listSql, [...args, Number(pageSize), offset]);

  return { list, total, page: Number(page), pageSize: Number(pageSize) };
}

module.exports = {
  getMonthQuota,
  checkQuota,
  consumeTokens,
  adminSetQuota,
  adminStats,
  adminGrantAgentToken,
  adminQueryTokenBills,
};
