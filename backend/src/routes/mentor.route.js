// 门店商业导师 Agent 路由
const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const mc = require('../controllers/mentor.controller');
const validate = require('../middlewares/validate');

// 全部需要登录(auth中间件从JWT提取tenantId)
router.post('/chat', auth, requirePerm('ai:call'), validate([
      { field: 'user_input', required: true, type: 'string', min: 1, max: 5000, message: '对话内容不能为空' },
    ]), mc.chat);
router.post('/chatStream', auth, requirePerm('ai:call'), validate([
      { field: 'user_input', required: true, type: 'string', min: 1, max: 5000, message: '对话内容不能为空' },
    ]), mc.chatStream);

module.exports = router;




