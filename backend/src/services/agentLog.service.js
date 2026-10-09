// Agent 审计日志 — Service层
// 管理员工具: 查所有租户日志 + 汇总 + CSV导出
// 商户工具: 只查自己租户的对话记录
const { query } = require('../config/db');

/**
 * 管理员: 分页查询任意租户的 Agent 日志
 * 支持: tenant_id / agent_name / 时间范围 / 状态
 */
async function adminList({ tenantId, agentName, status, startDate, endDate, keyword, page = 1, pageSize = 20 }) {
  const offset = (page - 1) * pageSize;
  const conds = [];
  const params = [];

  // admin 可指定 tenant_id, 不传则查全部 (排除 tenant_id < 0 的系统账号)
  if (tenantId) {
    conds.push('l.tenant_id = ?');
    params.push(tenantId);
  } else {
    conds.push('l.tenant_id > 0'); // 排除 admin 自身
  }
  if (agentName) { conds.push('l.agent_name = ?'); params.push(agentName); }
  if (status) { conds.push('l.status = ?'); params.push(status); }
  if (startDate) { conds.push('l.create_time >= ?'); params.push(startDate + ' 00:00:00'); }
  if (endDate) { conds.push('l.create_time <= ?'); params.push(endDate + ' 23:59:59'); }
  if (keyword) {
    conds.push('(l.input_params LIKE ? OR l.agent_output LIKE ?)');
    params.push('%' + keyword + '%', '%' + keyword + '%');
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  // 查询列表
  const rows = await query(
    `SELECT l.*, tu.username FROM ai_agent_task_log l
     LEFT JOIN tenant_user tu ON l.user_id = tu.id
     ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  // 总数
  const total = (await query(`SELECT COUNT(*) as c FROM ai_agent_task_log l ${where}`, params))[0].c;

  // 汇总统计 (按当前筛选条件)
  const summary = (await query(
    `SELECT
       COUNT(*) as total_calls,
       COUNT(DISTINCT l.agent_name) as agent_count,
       COUNT(DISTINCT l.tenant_id) as tenant_count,
       SUM(COALESCE(l.input_tokens, 0)) as total_input_tokens,
       SUM(COALESCE(l.output_tokens, 0)) as total_output_tokens,
       SUM(COALESCE(l.total_cost, 0)) as total_cost_usd
     FROM ai_agent_task_log l ${where}`,
    params
  ))[0];

  return { list: rows, total, summary, page, pageSize };
}

/**
 * 管理员: 汇总统计 (不带列表的纯数字汇总, 可用于顶部总览卡片)
 */
async function adminSummary({ tenantId, startDate, endDate }) {
  const conds = [];
  const params = [];
  if (tenantId) { conds.push('tenant_id = ?'); params.push(tenantId); }
  if (startDate) { conds.push('create_time >= ?'); params.push(startDate + ' 00:00:00'); }
  if (endDate) { conds.push('create_time <= ?'); params.push(endDate + ' 23:59:59'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  const row = (await query(
    `SELECT
       COUNT(*) as total_calls,
       COUNT(DISTINCT agent_name) as agent_count,
       COUNT(DISTINCT tenant_id) as tenant_count,
       SUM(COALESCE(input_tokens, 0)) as total_input_tokens,
       SUM(COALESCE(output_tokens, 0)) as total_output_tokens,
       SUM(COALESCE(total_cost, 0)) as total_cost_usd
     FROM ai_agent_task_log ${where}`,
    params
  ))[0];

  // 按 agent_name 分组调用次数
  const byAgent = await query(
    `SELECT agent_name, COUNT(*) as calls, SUM(COALESCE(total_cost,0)) as cost
     FROM ai_agent_task_log ${where} GROUP BY agent_name ORDER BY calls DESC`,
    params
  );

  return { summary: row, by_agent: byAgent };
}

/**
 * 商户: 查自身 tenant_id 的对话历史 (脱敏, 不返回 token/cost)
 */
async function userHistory(tenantId, { agentName, keyword, startDate, endDate, page = 1, pageSize = 20 }) {
  const offset = (page - 1) * pageSize;
  const conds = ['tenant_id = ?'];
  const params = [tenantId];
  if (agentName) { conds.push('agent_name = ?'); params.push(agentName); }
  if (startDate) { conds.push('create_time >= ?'); params.push(startDate + ' 00:00:00'); }
  if (endDate) { conds.push('create_time <= ?'); params.push(endDate + ' 23:59:59'); }
  if (keyword) {
    conds.push('(input_params LIKE ? OR agent_output LIKE ?)');
    params.push('%' + keyword + '%', '%' + keyword + '%');
  }
  const where = 'WHERE ' + conds.join(' AND ');

  const rows = await query(
    `SELECT id, task_id, agent_name, status, input_params, agent_output, create_time
     FROM ai_agent_task_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const total = (await query(`SELECT COUNT(*) as c FROM ai_agent_task_log ${where}`, params))[0].c;
  return { list: rows, total, page, pageSize };
}

module.exports = { adminList, adminSummary, userHistory };

