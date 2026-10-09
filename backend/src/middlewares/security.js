// 企业级安全中间件: helmet 安全头 + 全局/IP 限流 + XSS 清洗
// 安装依赖: npm i helmet express-rate-limit xss-clean
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');

/**
 * 全局速率限制: 每个 IP 15 分钟内最多 100 次请求
 * 超出返回 429, 提示前端降频
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁,请稍后再试', data: null },
});

/**
 * 登录接口速率限制: 每个 IP 15 分钟内最多 5 次失败登录
 * 用于防止登录暴力破解
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '登录失败次数过多,请 15 分钟后再试', data: null },
});

/**
 * 一键挂载全部安全中间件
 * @param {import('express').Express} app Express 实例
 */
function mountSecurity(app) {
  // 信任反向代理(Nginx SSL 反代后能正确取客户端真实 IP)
  app.set('trust proxy', 1);

  // helmet 安全响应头;关闭 CSP 以兼容前端内联脚本
  app.use(helmet({ contentSecurityPolicy: false }));

  // 全局速率限制
  app.use(globalLimiter);

  // XSS 清洗请求体
  app.use(xss());
}

module.exports = { mountSecurity, globalLimiter, loginLimiter, helmet };
