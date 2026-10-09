// 认证路由(公开接口,无需登录)
const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');

// 商户注册
router.post(
  '/register',
  validate([
    { field: 'username', required: true, type: 'string', min: 5, max: 64, message: '登录账号不能为空' },
    { field: 'password', required: true, type: 'string', min: 6, max: 128, message: '密码至少6位' },
    { field: 'merchantName', required: true, type: 'string', min: 1, max: 64, message: '商户名称不能为空' },
    { field: 'storeName', type: 'string', max: 64 },
    { field: 'industry', type: 'string', max: 32 },
    { field: 'contactPhone', type: 'string', max: 20 },
  ]),
  authController.register
);

// 账号登录
router.post(
  '/login',
  validate([
    { field: 'username', required: true, type: 'string', max: 64, message: '登录账号不能为空' },
    { field: 'password', required: true, type: 'string', max: 128, message: '密码不能为空' },
  ]),
  authController.login
);

module.exports = router;