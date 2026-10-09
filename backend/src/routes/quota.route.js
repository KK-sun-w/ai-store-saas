// 配额路由
const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const quotaController = require('../controllers/quota.controller');

router.use(auth);

// 查询当日配额(调用次数, 登录即可)
router.get('/today', quotaController.today);

// 查询 Agent Token 配额(登录即可)
router.get('/agent-token', quotaController.agentToken);

// 扣减一次调用(需 ai:call 权限)
router.post('/consume', requirePerm('ai:call'), quotaController.consume);

module.exports = router;