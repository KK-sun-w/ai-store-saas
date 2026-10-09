const router = require('express').Router();
const { auth, requireRole } = require('../middlewares/auth');
const controller = require('../controllers/tokenQuota.controller');

// 管理员接口: Token 统计 + 额度配置
router.get('/admin/stats', auth, requireRole('admin'), controller.adminStats);
router.put('/admin/quota/:tenantId', auth, requireRole('admin'), controller.adminSetQuota);

// 商户接口: 查看自己的本月额度
router.get('/my', auth, controller.myQuota);

module.exports = router;
