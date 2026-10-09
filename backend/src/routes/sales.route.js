// 销售单路由
const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const validate = require('../middlewares/validate');
const salesController = require('../controllers/sales.controller');

router.use(auth);

router.get('/', salesController.list);
router.get('/:id', salesController.detail);

router.post(
  '/',
  requirePerm('sale:write'),
  validate([
    { field: 'items', required: true, type: 'array', min: 1, message: '销售明细不能为空' },
    { field: 'customer_name', type: 'string', max: 64 },
  ]),
  salesController.create
);

module.exports = router;