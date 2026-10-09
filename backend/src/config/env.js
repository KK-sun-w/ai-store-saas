// 环境变量加载与集中导出
require('dotenv').config();

const env = {
  // 服务端口
  port: parseInt(process.env.PORT, 10) || 3000,

  // 数据库配置
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_store_saas',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  },

  // JWT 密钥与有效期
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_do_not_use_in_prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // bcrypt 哈希强度
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,

  // AI 每日调用默认上限
  aiDailyDefaultLimit: parseInt(process.env.AI_DAILY_DEFAULT_LIMIT, 10) || 100,
};

module.exports = env;