// 仪表盘控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const dashboardService = require('../services/dashboard.service');

// GET /dashboard/overview
exports.getOverview = asyncHandler(async (req, res) => {
  const data = await dashboardService.getOverview(req.user.tenantId);
  return ok(res, data);
});

// GET /dashboard/monthlySales?months=12
exports.getMonthlySales = asyncHandler(async (req, res) => {
  const months = Math.min(Number(req.query.months) || 12, 24);
  const data = await dashboardService.getMonthlySales(req.user.tenantId, months);
  return ok(res, data);
});
