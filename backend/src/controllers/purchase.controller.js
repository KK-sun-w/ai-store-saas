// 进货单控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPage } = require('../utils/response');
const purchaseService = require('../services/purchase.service');

exports.list = asyncHandler(async (req, res) => {
  const data = await purchaseService.list(req.user.tenantId, req.query);
  return okPage(res, data);
});

exports.detail = asyncHandler(async (req, res) => {
  const data = await purchaseService.detail(req.user.tenantId, req.params.id);
  return ok(res, data);
});

exports.create = asyncHandler(async (req, res) => {
  const data = await purchaseService.create(req.user.tenantId, req.body);
  return ok(res, data, '创建成功');
});

exports.confirm = asyncHandler(async (req, res) => {
  const data = await purchaseService.confirm(req.user.tenantId, req.params.id);
  return ok(res, data, '入库成功');
});