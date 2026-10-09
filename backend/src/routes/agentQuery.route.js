// Agent 专用聚合查询路由 (只读, 强制 tenant_id 隔离)
const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const ctrl = require('../controllers/agentQuery.controller');

router.use(auth);

router.get('/sales', ctrl.querySales);
router.get('/inventory', ctrl.queryInventory);
router.get('/expenses', ctrl.queryExpenses);

module.exports = router;