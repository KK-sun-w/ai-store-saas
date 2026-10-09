// Agent 共享工具：日志记录 + token估算 + 数据库只读查询
const { query } = require('../config/db');
const tokenQuotaService = require('../services/tokenQuota.service');

/** 生成唯一 task_id */
function genTaskId() {
  return `TASK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 粗略估算 LLM token (中文1.5, 英文0.25) */
function estimateTokens(s) {
  if (!s) return 0;
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  const cjk = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
  return Math.ceil(cjk * 1.5 + (str.length - cjk) * 0.25);
}

/** 粗略估算费用 (DeepSeek Chat: 输入$0.14/M, 输出$0.28/M) */
function calculateCost(inputTokens, outputTokens) {
  const cost = (inputTokens || 0) / 1000000 * 0.14 + (outputTokens || 0) / 1000000 * 0.28;
  return Math.round(cost * 10000) / 10000;
}

/**
 * 写入 Agent 执行日志 (ai_agent_task_log)
 * 没传 token_stats 时自动兜底估算 (从 input/output 文本长度)
 */
async function logAgentTask({ tenant_id, task_id, agent_name, input_params, agent_output, status, token_stats, total_cost, user_id }) {
  try {
    let inputTokens = token_stats?.input ?? null;
    let outputTokens = token_stats?.output ?? null;
    // 兜底: 没传 token_stats 时从入参/输出文本估算
    if (inputTokens == null) inputTokens = estimateTokens(input_params);
    if (outputTokens == null) outputTokens = estimateTokens(agent_output);
    const tc = total_cost ?? calculateCost(inputTokens, outputTokens);
    await query(
      `INSERT INTO ai_agent_task_log (tenant_id, task_id, user_id, agent_name, input_params, agent_output, status, input_tokens, output_tokens, total_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenant_id, task_id, user_id || null, agent_name,
        typeof input_params === 'string' ? input_params : JSON.stringify(input_params),
        typeof agent_output === 'string' ? agent_output : JSON.stringify(agent_output),
        status || 'success', inputTokens, outputTokens, tc]
    );

    // 消费 token (失败不影响日志写入)
    try {
      const totalTokens = (inputTokens || 0) + (outputTokens || 0);
      if (totalTokens > 0) {
        await tokenQuotaService.consumeTokens(tenant_id, totalTokens);
      }
    } catch (qe) {
      console.warn('[agentUtils] token 消费失败:', qe.message);
    }
  } catch (e) {
    console.warn('[agentUtils] logAgentTask 写入失败:', e.message);
  }
}

async function fetchProducts(tenantId) {
  return query('SELECT * FROM product WHERE tenant_id = ? AND status = 1 AND deleted = 0', [tenantId]);
}
async function fetchInventoryLogs(tenantId, limit = 50) {
  return query('SELECT * FROM inventory_log WHERE tenant_id = ? ORDER BY create_time DESC LIMIT ?', [tenantId, limit]);
}
async function fetchSalesOrders(tenantId, limit = 30) {
  return query(`SELECT so.*, GROUP_CONCAT(CONCAT(p.name,':',soi.quantity,'@',soi.unit_price)) as items_concat
    FROM sales_order so LEFT JOIN sales_order_item soi ON so.id = soi.sales_order_id LEFT JOIN product p ON p.id = soi.product_id
    WHERE so.tenant_id = ? GROUP BY so.id ORDER BY so.create_time DESC LIMIT ?`, [tenantId, limit]);
}
async function fetchPurchaseOrders(tenantId, limit = 30) {
  return query('SELECT * FROM purchase_order WHERE tenant_id = ? ORDER BY create_time DESC LIMIT ?', [tenantId, limit]);
}
async function fetchSalesSummary(tenantId) {
  const m = await query(
    `SELECT COALESCE(SUM(total_amount),0) as month_sales, COALESCE(SUM(total_cost),0) as month_cost,
            COALESCE(SUM(gross_profit),0) as month_profit, COUNT(*) as month_orders
     FROM sales_order WHERE tenant_id = ? AND status = 1 AND DATE_FORMAT(create_time,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')`,
    [tenantId]);
  const hot = await query(
    `SELECT p.name, SUM(soi.quantity) as qty, SUM(soi.amount) as revenue
     FROM sales_order so JOIN sales_order_item soi ON so.id = soi.sales_order_id JOIN product p ON p.id = soi.product_id
     WHERE so.tenant_id = ? AND so.status = 1 GROUP BY p.id ORDER BY qty DESC LIMIT 5`, [tenantId]);
  return { month_sales: Number(m[0].month_sales)||0, month_cost: Number(m[0].month_cost)||0,
           month_profit: Number(m[0].month_profit)||0, month_orders: m[0].month_orders, hot_products: hot };
}

module.exports = { genTaskId, logAgentTask, calculateCost, estimateTokens,
  fetchProducts, fetchInventoryLogs, fetchSalesOrders, fetchPurchaseOrders, fetchSalesSummary };




