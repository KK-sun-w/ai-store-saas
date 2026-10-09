// AI 配额限流业务逻辑
// 核心约束:使用 tenant_ai_quota.version 乐观锁做并发控制,
// 禁止简单的 used_count = used_count + 1 无版本校验累加。
const { query } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/appError');
const { getToday } = require('../utils/date');

// 确保当日配额记录存在(幂等,不存在则按默认上限插入)
async function ensureTodayRecord(tenantId) {
  await query(
    `INSERT INTO tenant_ai_quota (tenant_id, quota_date, daily_limit, used_count, version)
     VALUES (?, ?, ?, 0, 0)
     ON DUPLICATE KEY UPDATE id = id`,
    [tenantId, getToday(), env.aiDailyDefaultLimit]
  );
}

// 查询当日配额(不扣减)
async function getTodayQuota(tenantId) {
  await ensureTodayRecord(tenantId);
  const rows = await query(
    'SELECT quota_date, daily_limit, used_count, version FROM tenant_ai_quota WHERE tenant_id = ? AND quota_date = ? LIMIT 1',
    [tenantId, getToday()]
  );
  const rec = rows[0];
  return {
    quotaDate: rec.quota_date,
    dailyLimit: rec.daily_limit,
    usedCount: rec.used_count,
    remaining: rec.daily_limit - rec.used_count,
  };
}

// 扣减一次调用(version 乐观锁 + 有限重试)
async function consume(tenantId) {
  await ensureTodayRecord(tenantId);
  const date = getToday();
  const maxRetry = 3;

  for (let i = 0; i < maxRetry; i++) {
    const rows = await query(
      'SELECT id, daily_limit, used_count, version FROM tenant_ai_quota WHERE tenant_id = ? AND quota_date = ? LIMIT 1',
      [tenantId, date]
    );
    const rec = rows[0];
    if (!rec) throw new AppError(500, 500, '配额记录初始化失败');

    // 超限判断
    if (rec.used_count >= rec.daily_limit) {
      throw new AppError(429, 429, '当日AI调用额度已用完');
    }

    // CAS 更新:带 version 与超限条件,只有版本匹配且未超限才成功
    const result = await query(
      `UPDATE tenant_ai_quota
       SET used_count = used_count + 1, version = version + 1
       WHERE id = ? AND version = ? AND used_count < daily_limit`,
      [rec.id, rec.version]
    );

    if (result.affectedRows === 1) {
      return {
        used: rec.used_count + 1,
        dailyLimit: rec.daily_limit,
        remaining: rec.daily_limit - rec.used_count - 1,
      };
    }
    // affectedRows=0 说明发生版本冲突(并发),进入下一轮重试
  }

  throw new AppError(429, 429, '操作过于频繁,请稍后重试');
}

module.exports = { getTodayQuota, consume };