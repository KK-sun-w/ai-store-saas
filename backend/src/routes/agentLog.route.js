// Agent 审计日志路由
const express = require('express');
const router = express.Router();
const c = require('../controllers/agentLog.controller');

// ---- 管理员接口 (requireRole 中间件在 controller 内部) ----
router.get('/admin/list',    c.adminList);     // 管理员列表, 可传 tenant_id 查任意租户
router.get('/admin/summary', c.adminSummary);  // 顶部汇总卡片
router.get('/admin/export',  c.adminExport);   // CSV 导出

// ---- 商户接口 (自动从 JWT 取 tenant_id, 脱敏, 无 token/cost) ----
router.get('/user-history',  c.userHistory);   // 商户自己的对话历史

module.exports = router;
