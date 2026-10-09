// 配额控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const quotaService = require('../services/quota.service');
const { getAgentTokenQuota } = require('../utils/tokenQuota');

// 查询当日配额(调用次数)
exports.today = asyncHandler(async (req, res) => {
  const data = await quotaService.getTodayQuota(req.user.tenantId);
  return ok(res, data);
});

// 扣减一次调用(供后续 AI 能力接入前联调演示)
exports.consume = asyncHandler(async (req, res) => {
  const data = await quotaService.consume(req.user.tenantId);
  return ok(res, data, '额度扣减成功');
});

// 查询当前租户的 Agent Token 配额(total/used/remaining)
exports.agentToken = asyncHandler(async (req, res) => {
  const data = await getAgentTokenQuota(req.user.tenantId);
  return ok(res, data);
});