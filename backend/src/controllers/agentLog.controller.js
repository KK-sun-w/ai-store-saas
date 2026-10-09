// Agent 审计日志 — Controller层
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const svc = require('../services/agentLog.service');
const { auth, requireRole } = require('../middlewares/auth');

// 通用函数: 从 input_params JSON 提取 user_input
function extractInput(raw) {
  if (!raw) return '';
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return j.user_input || j.message || j.input || '';
  } catch { return String(raw).slice(0, 100); }
}

// ============ 管理员接口 ============

/** GET /admin/agent-log/list — 管理员分页查询, 传 tenant_id 查指定租户, 不传查全部 */
exports.adminList = [
  auth, requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { tenant_id, agent_name, status, start_date, end_date, keyword, page, pageSize } = req.query;
    const result = await svc.adminList({
      tenantId: tenant_id, agentName: agent_name, status,
      startDate: start_date, endDate: end_date, keyword,
      page: Number(page) || 1, pageSize: Number(pageSize) || 20,
    });
    return ok(res, {
      total: result.total,
      summary: result.summary,
      list: result.list.map(r => ({
        id: r.id, task_id: r.task_id, tenant_id: r.tenant_id,
        agent_name: r.agent_name, username: r.username,
        input_preview: extractInput(r.input_params),
        output_preview: (r.agent_output || '').slice(0, 200),
        input_tokens: r.input_tokens, output_tokens: r.output_tokens,
        total_cost: Number(r.total_cost || 0),
        status: r.status, create_time: r.create_time,
      })),
    });
  })
];

/** GET /admin/agent-log/summary — 管理员顶部汇总卡片数据 */
exports.adminSummary = [
  auth, requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { tenant_id, start_date, end_date } = req.query;
    const result = await svc.adminSummary({ tenantId: tenant_id, startDate: start_date, endDate: end_date });
    return ok(res, result);
  })
];

/** GET /admin/agent-log/export — 管理员导出CSV */
exports.adminExport = [
  auth, requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { tenant_id, agent_name, start_date, end_date } = req.query;
    const result = await svc.adminList({
      tenantId: tenant_id, agentName: agent_name,
      startDate: start_date, endDate: end_date, page: 1, pageSize: 10000,
    });
    // 生成CSV (GBK避免Excel乱码)
    const headers = ['id','租户ID','agent类型','用户提问','AI回答前200字','输入token','输出token','费用(美元)','状态','时间'];
    const rows = [headers.join(',')];
    for (const r of result.list) {
      const esc = s => (s || '').toString().replace(/"/g, '""').replace(/\n/g, ' ');
      rows.push([
        r.id, r.tenant_id, r.agent_name,
        '"' + esc(extractInput(r.input_params)) + '"',
        '"' + esc((r.agent_output || '').slice(0, 200)) + '"',
        r.input_tokens || '', r.output_tokens || '',
        Number(r.total_cost || 0).toFixed(4),
        r.status, r.create_time,
      ].join(','));
    }
    const csv = '\ufeff' + rows.join('\n'); // BOM 让 Excel 正确识别中文
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=agent_log_' + Date.now() + '.csv');
    res.send(csv);
  })
];

// ============ 商户接口 ============

/** GET /agent-log/user-history — 商户查自己的对话记录 (脱敏, 无token/cost) */
exports.userHistory = [
  auth, // 不要求 admin, 只要登录
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId; // 唯一来源, 拒绝前端传
    const { agent_name, keyword, start_date, end_date, page, pageSize } = req.query;
    const result = await svc.userHistory(tenantId, {
      agentName: agent_name, keyword,
      startDate: start_date, endDate: end_date,
      page: Number(page) || 1, pageSize: Number(pageSize) || 20,
    });
    return ok(res, {
      total: result.total,
      list: result.list.map(r => ({
        id: r.id, task_id: r.task_id, agent_name: r.agent_name, status: r.status,
        input_preview: extractInput(r.input_params),
        output_preview: (r.agent_output || '').slice(0, 500),
        create_time: r.create_time,
      })),
    });
  })
];
