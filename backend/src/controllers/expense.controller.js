// 开销控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPage } = require('../utils/response');
const expenseService = require('../services/expense.service');

exports.list = asyncHandler(async (req, res) => {
  const data = await expenseService.list(req.user.tenantId, req.query);
  return okPage(res, data);
});

exports.detail = asyncHandler(async (req, res) => {
  const data = await expenseService.detail(req.user.tenantId, req.params.id);
  return ok(res, data);
});

exports.create = asyncHandler(async (req, res) => {
  const data = await expenseService.create(req.user.tenantId, req.body);
  return ok(res, data, '创建成功');
});

exports.update = asyncHandler(async (req, res) => {
  const data = await expenseService.update(req.user.tenantId, req.params.id, req.body);
  return ok(res, data, '更新成功');
});

exports.remove = asyncHandler(async (req, res) => {
  const data = await expenseService.remove(req.user.tenantId, req.params.id);
  return ok(res, data, '删除成功');
});