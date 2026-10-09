// 销售单控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPage } = require('../utils/response');
const salesService = require('../services/sales.service');

exports.list = asyncHandler(async (req, res) => {
  const data = await salesService.list(req.user.tenantId, req.query);
  return okPage(res, data);
});

exports.detail = asyncHandler(async (req, res) => {
  const data = await salesService.detail(req.user.tenantId, req.params.id);
  return ok(res, data);
});

exports.create = asyncHandler(async (req, res) => {
  const data = await salesService.create(req.user.tenantId, req.body);
  return ok(res, data, '开单成功');
});