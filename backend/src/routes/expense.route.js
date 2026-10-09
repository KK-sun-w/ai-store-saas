// 开销记录路由
const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const validate = require('../middlewares/validate');
const expenseController = require('../controllers/expense.controller');

router.use(auth);

router.get('/', expenseController.list);
router.get('/:id', expenseController.detail);

router.post(
  '/',
  requirePerm('expense:write'),
  validate([
    { field: 'expense_type', required: true, type: 'string', max: 32, message: '开销类型不能为空' },
    { field: 'amount', required: true, type: 'number', min: 0, message: '开销金额不合法' },
  ]),
  expenseController.create
);

router.put(
  '/:id',
  requirePerm('expense:write'),
  validate([{ field: 'id', required: true, type: 'int', min: 1, message: '开销记录ID不合法' }]),
  expenseController.update
);

router.delete(
  '/:id',
  requirePerm('expense:write'),
  validate([{ field: 'id', required: true, type: 'int', min: 1, message: '开销记录ID不合法' }]),
  expenseController.remove
);

module.exports = router;