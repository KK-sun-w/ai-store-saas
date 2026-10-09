// 超级管理员路由 (requireRole admin)
const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middlewares/auth');
const { query } = require('../config/db');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const tokenQuotaService = require('../services/tokenQuota.service');

// GET /api/admin/tenants — 列出所有商户租户
router.get('/tenants', auth, requireRole('admin'), asyncHandler(async (req, res) => {
  const tenants = await query(
    `SELECT t.id, t.merchant_name, t.store_name, t.industry,
            (SELECT COUNT(*) FROM tenant_user WHERE tenant_id = t.id) as user_count,
            (SELECT COUNT(*) FROM ai_agent_task_log WHERE tenant_id = t.id) as ai_call_count
     FROM tenant t WHERE t.id > 0 ORDER BY t.id DESC`
  );
  return ok(res, { list: tenants, total: tenants.length });
}));

// PUT /api/admin/quota/agent-token — 给租户赠送/调整 Agent Token 额度
// body: { tenantId, grantToken }  grantToken正数=增加, 负数=减少
router.put('/quota/agent-token', auth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { tenantId, grantToken } = req.body;
  if (!tenantId || grantToken == null) {
    return res.status(400).json({ code: 400, message: 'tenantId 和 grantToken 为必填', data: null });
  }
  const result = await tokenQuotaService.adminGrantAgentToken(Number(tenantId), Number(grantToken));
  return ok(res, result);
}));

// GET /api/admin/token-bill — 分页查询 Token 对账流水
// query: page, pageSize, tenantId, scene, startDate, endDate
router.get('/token-bill', auth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { page, pageSize, tenantId, scene, startDate, endDate } = req.query;
  const result = await tokenQuotaService.adminQueryTokenBills({
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20,
    tenantId: tenantId || undefined,
    scene: scene || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });
  return ok(res, result);
}));

module.exports = router;