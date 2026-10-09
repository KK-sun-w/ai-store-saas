const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const vc = require('../controllers/videoGenerate.controller');

router.post('/task', auth, requirePerm('ai:call'), vc.createTask);
router.get('/task/:task_id', auth, requirePerm('ai:call'), vc.getTask);
router.get('/templates', auth, requirePerm('ai:call'), vc.listTemplates);

module.exports = router;

