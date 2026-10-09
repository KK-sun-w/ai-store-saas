// 库存盘点路由(需登录 + 盘点调整权限)
const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const validate = require('../middlewares/validate');
const inventoryController = require('../controllers/inventory.controller');
 
// 所有库存接口必须登录
router.use(auth);
 
// 盘点调整:需要 stock:adjust 权限
router.post(
  '/checkAdjust',
  requirePerm('stock:adjust'),
  validate([
    { field: 'product_id', required: true, type: 'int', min: 1, message: '商品ID不合法' },
    { field: 'adjust_num', required: true, type: 'number', message: '调整数量不合法' },
    { field: 'remark', type: 'string', max: 255 },
  ]),
  inventoryController.checkAdjust
);
 
module.exports = router;