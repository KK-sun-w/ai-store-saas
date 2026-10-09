// 认证业务逻辑:商户注册与账号登录
const bcrypt = require('bcryptjs'); // 纯 JS 实现 bcrypt 算法,Windows 开箱即用,无需 node-gyp 编译
const { query, getConnection } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/appError');
const { signToken } = require('../middlewares/auth');
const { getToday } = require('../utils/date');

/**
 * 商户注册:创建租户 + 店主账号 + 绑定 owner 角色 + 初始化当日 AI 配额。
 * 注意:登录账号(username)对外即手机号,全局唯一。
 */
async function register({ username, password, merchantName, storeName, industry, contactPhone }) {
  // 1. 登录账号全局唯一校验(避免跨租户重名,保证登录时能唯一定位到用户)
  const exists = await query('SELECT id FROM tenant_user WHERE username = ? LIMIT 1', [username]);
  if (exists.length) {
    throw new AppError(409, 409, '该登录账号已被注册');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // 2. 创建租户
    const [tenantResult] = await conn.query(
      'INSERT INTO tenant (merchant_name, store_name, industry, contact_phone) VALUES (?, ?, ?, ?)',
      [merchantName, storeName || '', industry || '', contactPhone || username]
    );
    const tenantId = tenantResult.insertId;

    // 3. 创建店主账号(密码仅存哈希,不存明文)
    const [userResult] = await conn.query(
      'INSERT INTO tenant_user (tenant_id, username, password_hash, real_name, role) VALUES (?, ?, ?, ?, ?)',
      [tenantId, username, passwordHash, merchantName, 'owner']
    );
    const userId = userResult.insertId;

    // 4. 查找系统预置 owner 角色并绑定(按 role_code 定位,避免硬编码主键)
    const [roleRows] = await conn.query(
      'SELECT id FROM role WHERE tenant_id = 0 AND role_code = ? LIMIT 1',
      ['owner']
    );
    if (!roleRows.length) {
      throw new AppError(500, 500, '系统角色未初始化,请先执行权限初始化脚本');
    }
    await conn.query(
      'INSERT INTO tenant_user_role (tenant_id, user_id, role_id) VALUES (?, ?, ?)',
      [tenantId, userId, roleRows[0].id]
    );

    // 5. 初始化当日 AI 配额
    await conn.query(
      'INSERT INTO tenant_ai_quota (tenant_id, quota_date, daily_limit, used_count, version) VALUES (?, ?, ?, 0, 0)',
      [tenantId, getToday(), env.aiDailyDefaultLimit]
    );

    // 6. 初始化 Agent Token 配额(默认赠送50万Token用于体验)
    await conn.query(
      'INSERT INTO ai_quota (tenant_id, agent_token_total, agent_token_used) VALUES (?, 500000, 0)',
      [tenantId]
    );

    await conn.commit();
    return { tenantId, userId, username };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * 账号登录。
 * tenant_id 来自数据库命中的用户记录,而非请求参数,保证身份真实性。
 */
async function login({ username, password }) {
  const rows = await query(
    `SELECT id, tenant_id, username, password_hash, real_name, role, status
     FROM tenant_user WHERE username = ? LIMIT 1`,
    [username]
  );
  if (!rows.length) {
    throw new AppError(401, 401, '账号或密码错误');
  }
  const user = rows[0];

  if (user.status !== 1) {
    throw new AppError(403, 403, '账号已被禁用,请联系管理员');
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw new AppError(401, 401, '账号或密码错误');
  }

  // 更新最后登录时间(非关键,失败不阻塞登录)
  query('UPDATE tenant_user SET last_login_time = NOW() WHERE id = ?', [user.id]).catch(() => {});

  const token = signToken(user);
  return {
    token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      username: user.username,
      role: user.role,
    },
  };
}

module.exports = { register, login };
