// 仪表盘路由
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');

const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');

router.use(auth);
router.use(requirePerm('report:read'));

router.get('/overview', dashboardController.getOverview);
router.get('/monthlySales', dashboardController.getMonthlySales);

module.exports = router;

