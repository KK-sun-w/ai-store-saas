const express = require('express');
const router = express.Router();


router.use('/auth', require('./auth.route'));
router.use('/products', require('./product.route'));
router.use('/purchases', require('./purchase.route'));
router.use('/sales', require('./sales.route'));
router.use('/expenses', require('./expense.route'));
router.use('/quota', require('./quota.route'));
router.use('/inventory', require('./inventory.route'));
router.use('/upload', require('./upload.route'));
router.use('/dashboard', require('./dashboard.route'));
router.use('/ai/agent', require('./ai.route'));

router.use('/ai', require('./aiAgent.route'));
router.use('/video-task', require('./videoGenerate.route'));
router.use('/product-video', require('./productVideo.route'));
router.use('/shop-memory', require('./shopMemory.route'));
router.use('/agent-log', require('./agentLog.route'));
// 数字人形象管理(店主及以上)
router.use('/digital-human', require('./digitalHuman.route'));
// 业务操作审计日志(管理员可查全部租户, 放在通用 /admin 之前确保精确匹配)
router.use('/admin/operation-log', require('./operationLog.route'));
router.use('/admin', require('./admin.route'));
router.use('/mentor', require('./mentor.route'));
router.use('/agent-query', require('./agentQuery.route'));

module.exports = router;
