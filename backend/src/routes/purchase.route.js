// 进货单路由
const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const validate = require('../middlewares/validate');
const purchaseController = require('../controllers/purchase.controller');

router.use(auth);

router.get('/', purchaseController.list);
router.get('/:id', purchaseController.detail);

// 创建进货单(草稿)
router.post(
  '/',
  requirePerm('purchase:write'),
  validate([
    { field: 'items', required: true, type: 'array', min: 1, message: '进货明细不能为空' },
    { field: 'supplier_name', type: 'string', max: 64 },
  ]),
  purchaseController.create
);

// 确认入库(影响库存,需 purchase:approve)
router.post(
  '/:id/confirm',
  requirePerm('purchase:approve'),
  validate([{ field: 'id', required: true, type: 'int', min: 1, message: '进货单ID不合法' }]),
  purchaseController.confirm
);

module.exports = router;