// 店铺长期记忆 Controller
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPage, fail } = require('../utils/response');
const svc = require('../services/shopMemory.service');

// 分页查询记忆列表(支持按类型/来源/权重筛选)
exports.list = asyncHandler(async (req, res) => {
  const data = await svc.list(req.user.tenantId, req.query);
  return okPage(res, data);
});

// 查询单条记忆详情
exports.detail = asyncHandler(async (req, res) => {
  const data = await svc.detail(req.user.tenantId, req.params.id);
  return ok(res, data);
});

// 新增记忆
exports.create = asyncHandler(async (req, res) => {
  const data = await svc.create(req.user.tenantId, req.body);
  return ok(res, data, '记忆已保存');
});

// 更新记忆
exports.update = asyncHandler(async (req, res) => {
  const data = await svc.update(req.user.tenantId, req.params.id, req.body);
  return ok(res, data, '记忆已更新');
});

// 删除记忆
exports.remove = asyncHandler(async (req, res) => {
  const data = await svc.remove(req.user.tenantId, req.params.id);
  return ok(res, data, '记忆已删除');
});

// 查询权重最高的N条记忆(供AI Agent调用,注入prompt)
exports.topMemories = asyncHandler(async (req, res) => {
  const limit = req.query.limit || 10;
  const data = await svc.listTopMemories(req.user.tenantId, limit);
  return ok(res, data);
});
