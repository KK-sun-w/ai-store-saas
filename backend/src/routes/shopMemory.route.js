// ================================================================
// 店铺长期记忆路由
// 包含: 基础CRUD + 业务读写逻辑 + 记忆增强对话
// 所有接口需登录, tenant_id 一律从JWT的 req.user.tenantId 获取
// ================================================================
const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const validate = require('../middlewares/validate');

// --- 基础CRUD控制器 ---
const ctrl = require('../controllers/shopMemory.controller');

// --- 业务逻辑控制器(记忆增强对话/业务数据写入/记忆提取/聊天归档) ---
const memChat = require('../controllers/memoryChat.controller');

// ================================================================
// B. 业务读写逻辑(必须放在 /:id 前面, 否则GET路由被 :id 拦截)
// ================================================================

// 记忆增强对话: 注入记忆 -> 调agent -> 提取记忆 -> 归档
router.post('/chat', auth, requirePerm('ai:call'), validate([
      { field: 'message', required: true, type: 'string', min: 1, max: 5000, message: '对话内容不能为空' },
    ]), memChat.chat);

// 进销存业务数据自动写入记忆(前端在销售/进货完成后调用)
router.post('/business-record', auth, requirePerm('ai:call'), validate([
      { field: 'record_type', required: true, type: 'string', max: 32, message: 'record_type 不能为空' },
      { field: 'content', required: true, type: 'string', min: 1, max: 2000, message: 'content 不能为空' },
    ]), memChat.recordBusiness);

// 手动触发LLM记忆提取(调试用, 系统通常自动调用)
router.post('/extract', auth, requirePerm('ai:call'), memChat.extract);

// 原始聊天归档(仅审计, 不参与AI推理)
router.post('/archive-chat', auth, requirePerm('ai:call'), memChat.archiveChat);

// 查看注入prompt的记忆文本(调试用)——必须在 /:id 前面
router.get('/inject', auth, requirePerm('ai:call'), memChat.inject);

// ================================================================
// A. 基础CRUD
// ================================================================

// 分页查询记忆列表(支持memory_type/memory_source/min_importance筛选)
router.get('/', auth, ctrl.list);

// 查询权重最高的记忆(供AI Agent注入prompt)——放在 /:id 前面
router.get('/top', auth, ctrl.topMemories);

// 查询单条记忆详情
router.get('/:id', auth, ctrl.detail);

// 新增记忆
router.post('/', auth, validate([
      { field: 'memory_content', required: true, type: 'string', min: 1, max: 2000, message: '记忆内容不能为空且不超过2000字' },
      { field: 'memory_type', required: false, type: 'string', max: 32 },
      { field: 'importance', required: false, type: 'int', min: 1, max: 10 },
    ]), ctrl.create);

// 更新记忆
router.put('/:id', auth, validate([
      { field: 'memory_content', required: false, type: 'string', min: 1, max: 2000 },
      { field: 'importance', required: false, type: 'int', min: 1, max: 10 },
    ]), ctrl.update);

// 删除记忆
router.delete('/:id', auth, ctrl.remove);

module.exports = router;




