// 商品销售视频路由
const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const pc = require('../controllers/productVideo.controller');

// 上传商品图片（多文件，最多5张）
router.post('/upload', auth, requirePerm('product:write'), pc.uploadMiddleware, pc.uploadImages);

// AI 识别商品 + 生成卖点
router.post('/analyze', auth, requirePerm('ai:call'), pc.analyzeProduct);

// 生成商品销售视频
router.post('/task', auth, requirePerm('ai:call'), pc.createTask);

// 查询任务状态
router.get('/task/:task_id', auth, requirePerm('ai:call'), pc.getTask);

// ??????????? BLOB?
router.get('/stream/:task_id', pc.streamVideo);

// 商品视频模板列表
router.get('/templates', auth, requirePerm('ai:call'), pc.listTemplates);

// ?????????? auth?????
router.post('/internal-save', pc.uploadMiddleware, pc.internalSave);

module.exports = router;

