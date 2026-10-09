// AI Agent 路由
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const storeAgent = require('../controllers/storeAgent.controller');
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const validate = require('../middlewares/validate');
const checkTokenQuota = require('../middlewares/checkTokenQuota');

router.use(auth);
router.use(requirePerm('ai:call'));
router.use(checkTokenQuota);

router.post('/chat', validate([
    { field: 'user_input', required: true, type: 'string', min: 1, max: 5000, message: '对话内容不能为空' },
  ]), aiController.chat);
router.post('/chatStream', validate([
    { field: 'user_input', required: true, type: 'string', min: 1, max: 5000, message: '对话内容不能为空' },
  ]), aiController.chatStream);

// 门店综合业务 Agent (统一入口: 库存/商品/销售/采购/经营咨询)
router.post('/store-business', validate([
    { field: 'input', required: true, type: 'string', min: 1, max: 5000, message: '业务需求不能为空' },
  ]), storeAgent.run);

module.exports = router;



