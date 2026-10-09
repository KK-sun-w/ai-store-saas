// 业务操作审计日志路由 — 仅 admin
const express = require('express');
const router = express.Router();
const { getList } = require('../controllers/operationLog.controller');

// GET /api/admin/operation-log
router.get('/', getList);

module.exports = router;
