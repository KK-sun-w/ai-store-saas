// Express 应用装配
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { mountSecurity, loginLimiter } = require('./middlewares/security');
const operationLog = require('./middlewares/operationLog');

const app = express();

// 信任反向代理并挂载安全中间件(helmet/限流/XSS)
mountSecurity(app);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 登录接口独立限流,防暴力破解
app.use('/api/auth/login', loginLimiter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'up' } });
});

// 上传图片静态目录
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// AI 生成视频静态目录
app.use('/videos-out', express.static(path.join(__dirname, '../videos_out')));
app.use('/videos', express.static(path.join(__dirname, '../public/videos')));

// 业务操作审计日志(后置, 在 res.finish 时异步写库, 不阻塞响应)
app.use(operationLog);

// 前端 dist 静态托管
const distDir = path.join(__dirname, '../dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/videos')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// 业务路由统一挂在 /api 前缀下
app.use('/api', routes);

// 404 与统一异常处理必须放在最后
app.use(notFound);
app.use(errorHandler);

module.exports = app;
