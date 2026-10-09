// 认证控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const authService = require('../services/auth.service');

// 商户注册
exports.register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return ok(res, result, '注册成功');
});

// 账号登录
exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result, '登录成功');
});