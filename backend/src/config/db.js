// MySQL 连接池与查询封装
const mysql = require('mysql2/promise');
const env = require('./env');

// 创建连接池
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+08:00',
});

/**
 * 便捷查询封装。
 * 说明:使用文本协议 + 客户端占位符转义(参数化),可有效防 SQL 注入。
 * 返回值约定:
 *   - SELECT:返回行数组  rows
 *   - INSERT/UPDATE/DELETE:返回 ResultSetHeader(含 insertId / affectedRows)
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// 获取一个独立连接(事务场景使用,需手动 beginTransaction/commit/release)
async function getConnection() {
  return pool.getConnection();
}

module.exports = { pool, query, getConnection };