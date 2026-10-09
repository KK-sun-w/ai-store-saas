// 服务启动入口
const path = require('path');
const express = require('express');

const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

// 静态资源，访问上传图片（对应 public/upload 目录）
app.use('/upload', express.static(path.join(__dirname, '../public/upload')))

// 注册数据库定时备份任务(每天 03:00)
require('../scripts/backup-db');

async function bootstrap() {
  // 启动前探测数据库连接
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[DB] 数据库连接成功');
  } catch (e) {
    console.error('[DB] 数据库连接失败，请检查 .env 配置与数据库是否已初始化');
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`[Server] 服务已启动: http://127.0.0.1:${env.port}`);
    console.log(`[Server] 健康检查: http://127.0.0.1:${env.port}/health`);
  });
}

bootstrap();
