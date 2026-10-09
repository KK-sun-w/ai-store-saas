// 商品路由(需登录)
const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const validate = require('../middlewares/validate');
const productController = require('../controllers/product.controller');
 
router.use(auth);
 
// 查询(登录即可)
router.get('/', productController.list);
router.get('/:id', productController.detail);
 
// 写操作需要 product:write 权限
router.post(
  '/',
  requirePerm('product:write'),
  validate([
    { field: 'sku_code', required: false, type: 'string', max: 64 },
    { field: 'name', required: true, type: 'string', min: 1, max: 128, message: '商品名称不能为空' },
    { field: 'sale_price', type: 'number', min: 0 },
    { field: 'cost_price', type: 'number', min: 0 },
    { field: 'initial_stock', type: 'number', min: 0, message: '期初库存不能为负数' },
  ]),
  productController.create
);
 
router.put(
  '/:id',
  requirePerm('product:write'),
  validate([
    { field: 'id', required: true, type: 'int', min: 1, message: '商品ID不合法' },
  ]),
  productController.update
);
 
router.delete(
  '/:id',
  requirePerm('product:write'),
  validate([
    { field: 'id', required: true, type: 'int', min: 1, message: '商品ID不合法' },
  ]),
  productController.remove
);
 
module.exports = router;

