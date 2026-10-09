// 多 Agent 调度控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { genTaskId } = require('../agents/agentUtils');

const supervisor = require('../agents/supervisor.agent');

const AGENT_REGISTRY = {
  inventory:   (tId, input, taskId) => require('../agents/inventory.agent').run(tId, input, taskId),
  product:     (tId, input, taskId) => require('../agents/product.agent').run(tId, input, taskId),
  marketing:   (tId, input, taskId) => require('../agents/marketing.agent').run(tId, input, taskId),
  sales:       (tId, input, taskId) => require('../agents/sales.agent').run(tId, input, taskId),
  procurement: (tId, input, taskId) => require('../agents/procurement.agent').run(tId, input, taskId),
};

exports.dispatch = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const userQuery = req.body.user_query;
  if (!userQuery) return res.status(400).json({ code: 400, message: '缺少 user_query' });
  const taskId = genTaskId();
  const agentRunner = async (name, tId, input, tTaskId) => {
    const fn = AGENT_REGISTRY[name];
    if (!fn) throw new Error('未知Agent: ' + name);
    return fn(tId, input, tTaskId);
  };
  const { result, agent_trace } = await supervisor.run(tenantId, userQuery, taskId, agentRunner);
  return ok(res, { result, agent_trace }, '调度完成');
});

exports.runInventory = asyncHandler(async (req, res) => {
  const t = req.user.tenantId, tid = genTaskId();
  const r = await AGENT_REGISTRY.inventory(t, req.body.input || '请对当前门店库存做全面分析', tid);
  return ok(res, { result: r, task_id: tid }, '库存分析完成');
});

exports.runProduct = asyncHandler(async (req, res) => {
  const t = req.user.tenantId, tid = genTaskId();
  const r = await AGENT_REGISTRY.product(t, req.body.input || '请对当前门店所有商品做运营分析', tid);
  return ok(res, { result: r, task_id: tid }, '商品运营完成');
});

exports.runMarketing = asyncHandler(async (req, res) => {
  const t = req.user.tenantId, tid = genTaskId();
  const r = await AGENT_REGISTRY.marketing(t, req.body.input || '请生成一条抖音短视频文案', tid);
  return ok(res, { result: r, task_id: tid }, '短视频文案生成完成');
});

exports.runSales = asyncHandler(async (req, res) => {
  const t = req.user.tenantId, tid = genTaskId();
  const r = await AGENT_REGISTRY.sales(t, req.body.input || '请生成本月销售经营简报', tid);
  return ok(res, { result: r, task_id: tid }, '销售报表生成完成');
});

exports.runProcurement = asyncHandler(async (req, res) => {
  const t = req.user.tenantId, tid = genTaskId();
  const r = await AGENT_REGISTRY.procurement(t, req.body.input || '请生成一份采购建议清单', tid);
  return ok(res, { result: r, task_id: tid }, '采购建议生成完成');
});
