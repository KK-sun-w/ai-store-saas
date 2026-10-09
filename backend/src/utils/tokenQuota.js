// Agent Token 配额工具
// 核心约束:
//   1. 校验在调用大模型之前, 配额不足直接拦截(403), 不发起API请求
//   2. 扣减在大模型成功返回 usage 之后, 错误/熔断/超时不扣
//   3. 扣减用数据库原子 UPDATE(agent_token_used = agent_token_used + ?),
//      不使用 read-modify-write, 防止并发超扣
//   4. 每一笔消耗都写入 ai_token_bill 流水, 永久保存用于对账
const { query, getConnection } = require('../config/db');
const AppError = require('../utils/appError');
const { logger } = require('./logger');

// 默认新租户赠送 Token 数(与 SQL 迁移脚本保持一致)
const DEFAULT_AGENT_TOKEN = 500000;

/**
 * 确保租户的 ai_quota 记录存在, 不存在则按默认额度插入
 * 幂等操作
 */
async function ensureQuotaRecord(tenantId) {
  await query(
    `INSERT IGNORE INTO ai_quota (tenant_id, agent_token_total, agent_token_used)
     VALUES (?, ?, 0)`,
    [tenantId, DEFAULT_AGENT_TOKEN]
  );
}

/**
 * 校验 Agent Token 配额(调用大模型之前调用)
 * 剩余 = agent_token_total - agent_token_used
 * agent_token_total = 0 表示不限量
 * @param {number} tenantId 租户ID
 * @throws {AppError} 403 配额耗尽
 */
async function checkAgentTokenQuota(tenantId) {
  if (!tenantId) return; // 无租户信息(如内部调用), 跳过校验
  await ensureQuotaRecord(tenantId);
  const rows = await query(
    'SELECT agent_token_total, agent_token_used FROM ai_quota WHERE tenant_id = ? LIMIT 1',
    [tenantId]
  );
  const rec = rows[0];
  if (!rec) return;

  // total = 0 表示不限量
  if (rec.agent_token_total === 0) return;

  const remaining = rec.agent_token_total - rec.agent_token_used;
  if (remaining <= 0) {
    throw new AppError(403, 403, 'Agent Token配额已耗尽,请前往充值购买');
  }
}

/**
 * 扣减 Agent Token(大模型成功返回 usage 后调用)
 * 流程: ① 插入 ai_token_bill 流水  ② 原子更新 ai_quota.agent_token_used
 * 重要: 用单条 SQL 原子递增, 不查内存再扣, 防止并发超扣
 * @param {number} tenantId 租户ID
 * @param {number} userId 操作用户ID
 * @param {number} promptTokens 输入token数
 * @param {number} completionTokens 输出token数
 * @param {string} scene 消耗场景(store_business/mentor/video/reflection等)
 * @param {string} remark 备注
 */
async function deductAgentToken(tenantId, userId, promptTokens, completionTokens, scene, remark) {
  if (!tenantId) return; // 无租户信息, 不扣减
  const total = (promptTokens || 0) + (completionTokens || 0);
  if (total <= 0) return; // 无消耗, 不扣减

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // ① 插入流水记录
    await conn.query(
      `INSERT INTO ai_token_bill (tenant_id, user_id, prompt_tokens, completion_tokens, total_tokens, scene, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, userId || 0, promptTokens || 0, completionTokens || 0, total, scene || '', remark || '']
    );

    // ② 原子递增已用额度(不读内存, 直接 DB 累加)
    await conn.query(
      'UPDATE ai_quota SET agent_token_used = agent_token_used + ? WHERE tenant_id = ?',
      [total, tenantId]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    logger.error('[tokenQuota] 扣减Agent Token失败:', e.message);
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * 查询租户 Agent Token 配额(不扣减)
 * @returns {Promise<{total, used, remaining, unlimited}>}
 */
async function getAgentTokenQuota(tenantId) {
  await ensureQuotaRecord(tenantId);
  const rows = await query(
    'SELECT agent_token_total, agent_token_used FROM ai_quota WHERE tenant_id = ? LIMIT 1',
    [tenantId]
  );
  const rec = rows[0];
  const total = rec.agent_token_total;
  const used = rec.agent_token_used;
  return {
    total,
    used,
    remaining: total === 0 ? Infinity : total - used,
    unlimited: total === 0,
  };
}

module.exports = {
  checkAgentTokenQuota,
  deductAgentToken,
  getAgentTokenQuota,
  ensureQuotaRecord,
  DEFAULT_AGENT_TOKEN,
};
