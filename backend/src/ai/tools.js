// AI Agent 工具注册表 —— 严格对齐系统提示词定义的 4 个只读工具
// 所有工具查询强制携带 tenant_id (通过 JWT authToken 内部调用, 服务端 auth 中间件隔离)
// shop_id 参数出现在 schema 中供 LLM 感知, 实际隔离由 JWT 保证, 不接受前端传入的 shop_id
// 企业级加固: runTool 加权限校验 + try-catch + 审计日志(toolAudit.service)
const http = require('http');
const url = require('url');
const config = require('./config');
const { logToolCall } = require('../services/toolAudit.service');
const { logger } = require('../utils/logger');

// ---------- HTTP 客户端 ----------
async function callApi(method, path, body, authToken) {
  const parsed = url.parse(config.internalApi.baseUrl + path);
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsedBody = raw;
          try { parsedBody = JSON.parse(raw); } catch {}
          resolve({ status: res.statusCode, body: parsedBody });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('数据库查询超时,请稍后重试')));
    if (data) req.write(data);
    req.end();
  });
}

function formatToolResult(status, body) {
  if (status >= 400) {
    return `[API ${status}] ${JSON.stringify(body?.message || body, null, 2)}`;
  }
  if (body?.code === 0) {
    const d = body.data;
    if (d === null || d === undefined || (Array.isArray(d) && d.length === 0) || (typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length === 0)) {
      return '[空数据] 查询返回空结果, 该时间段无对应数据。请告知用户数据不足。';
    }
    return typeof d === 'string' ? d : JSON.stringify(d, null, 2);
  }
  return JSON.stringify(body, null, 2);
}

// ---------- 4 个只读工具 (严格对齐系统提示词) ----------
// permCode: null=任何已登录用户可用(只读); 非 null=需 RBAC 校验
const TOOLS = [
  // 工具1: 销售数据查询
  {
    name: 'query_sales_data',
    permCode: null,
    description: '查询指定时间段的销售数据。返回: 营收概况(总营收/成本/毛利/订单数)、单品销量排行、客户购买记录、近期订单明细。用于销售报表、经营分析。',
    parameters: {
      type: 'object',
      properties: {
        shop_id: { type: 'integer', description: '当前店铺ID (必填, 由系统注入)' },
        start_date: { type: 'string', description: '开始日期, 格式 YYYY-MM-DD, 默认为30天前' },
        end_date: { type: 'string', description: '结束日期, 格式 YYYY-MM-DD, 默认为今天' },
      },
      required: ['shop_id'],
    },
    async handler(args, ctx) {
      const qs = new URLSearchParams();
      if (args.start_date) qs.set('start_date', args.start_date);
      if (args.end_date) qs.set('end_date', args.end_date);
      const { status, body } = await callApi('GET', `/agent-query/sales?${qs}`, null, ctx.authToken);
      return formatToolResult(status, body);
    },
  },

  // 工具2: 库存查询
  {
    name: 'query_inventory_data',
    permCode: null,
    description: '查询当前店铺所有商品库存现状。返回: 商品库存总值、低库存预警商品列表、积压库存列表、全部商品明细(含成本/售价/库存/预警阈值)。用于库存分析、补货建议。',
    parameters: {
      type: 'object',
      properties: {
        shop_id: { type: 'integer', description: '当前店铺ID (必填, 由系统注入)' },
      },
      required: ['shop_id'],
    },
    async handler(args, ctx) {
      const { status, body } = await callApi('GET', '/agent-query/inventory', null, ctx.authToken);
      return formatToolResult(status, body);
    },
  },

  // 工具3: 开销查询
  {
    name: 'query_expense_data',
    permCode: null,
    description: '查询指定时间段的店铺开销记录。返回: 开销总额、按类型分组统计、明细记录。用于核算成本、经营分析。',
    parameters: {
      type: 'object',
      properties: {
        shop_id: { type: 'integer', description: '当前店铺ID (必填, 由系统注入)' },
        start_date: { type: 'string', description: '开始日期, 格式 YYYY-MM-DD' },
        end_date: { type: 'string', description: '结束日期, 格式 YYYY-MM-DD' },
      },
      required: ['shop_id'],
    },
    async handler(args, ctx) {
      const qs = new URLSearchParams();
      if (args.start_date) qs.set('start_date', args.start_date);
      if (args.end_date) qs.set('end_date', args.end_date);
      const { status, body } = await callApi('GET', `/agent-query/expenses?${qs}`, null, ctx.authToken);
      return formatToolResult(status, body);
    },
  },

  // 工具4: 店铺记忆读取 (只读)
  {
    name: 'query_shop_memory',
    permCode: null,
    description: '读取当前店铺的历史记忆信息, 包括店主决策偏好、店铺属性、过往业务备注。用于结合店铺实际情况给出定制化建议。只读, 不修改。',
    parameters: {
      type: 'object',
      properties: {
        shop_id: { type: 'integer', description: '当前店铺ID (必填, 由系统注入)' },
      },
      required: ['shop_id'],
    },
    async handler(args, ctx) {
      const { status, body } = await callApi('GET', '/shop-memory/top?limit=15', null, ctx.authToken);
      return formatToolResult(status, body);
    },
  },
];

// LLM 可见的 tools 定义 (去掉 handler / permCode)
function getToolsForLLM() {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/**
 * 权限校验: admin bypass; permCode=null 直接通过; 否则校验角色
 * (本系统 4 个工具均为只读, permCode=null, 所有已登录用户可用)
 */
function checkPermission(tool, ctx) {
  if (!tool.permCode) return { ok: true };
  if (ctx.role === 'admin') return { ok: true };
  if (ctx.role === 'owner') return { ok: true };
  return { ok: false, reason: '店员无权限调用工具: ' + tool.name };
}

/**
 * 执行工具: 权限校验 → try-catch → 审计日志
 * 审计通过 toolAudit.service 异步写库, 不阻塞主流程
 */
async function runTool(name, args, ctx) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`未知工具: ${name}, 只能调用系统提供的4个内置工具`);

  const start = Date.now();
  const taskId = ctx.taskId || 'unknown';
  const tenantId = ctx.tenantId || 0;

  // 权限校验
  const perm = checkPermission(tool, ctx);
  if (!perm.ok) {
    logToolCall({
      tenantId, taskId, toolName: name, inputArgs: args,
      outputResult: null, status: 'blocked',
      durationMs: Date.now() - start, errorMsg: perm.reason,
    });
    return `[权限拒绝] ${perm.reason}`;
  }

  // try-catch 执行 + 审计
  try {
    const result = await tool.handler(args, ctx);
    logToolCall({
      tenantId, taskId, toolName: name, inputArgs: args,
      outputResult: result, status: 'success',
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    logger.error(`[tools] 工具 ${name} 执行失败`, err.message);
    logToolCall({
      tenantId, taskId, toolName: name, inputArgs: args,
      outputResult: null, status: 'failed',
      durationMs: Date.now() - start, errorMsg: err.message,
    });
    return `[工具执行失败] ${name}: ${err.message}`;
  }
}

module.exports = { TOOLS, getToolsForLLM, runTool };
