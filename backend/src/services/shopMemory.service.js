// 店铺长期记忆 Service —— CRUD + 按权重查询(供AI Agent调用)
const { query } = require('../config/db');
const AppError = require('../utils/appError');
const { getPageParams } = require('../utils/page');

/**
 * 分页查询当前租户的记忆列表
 * @param {number} tenantId  租户ID(来自JWT,不可信来源不接入)
 * @param {object} params    { page, pageSize, memory_type, memory_source, min_importance, keyword }
 */
async function list(tenantId, params = {}) {
  const { page, pageSize, offset } = getPageParams(params);
  const conds = ['tenant_id = ?', 'deleted = 0'];
  const args = [tenantId];

  // 按记忆类型筛选
  if (params.memory_type) {
    conds.push('memory_type = ?');
    args.push(params.memory_type);
  }
  // 按数据来源筛选
  if (params.memory_source) {
    conds.push('memory_source = ?');
    args.push(params.memory_source);
  }
  // 最低权重过滤(只看重要记忆)
  if (params.min_importance !== undefined && params.min_importance !== '') {
    conds.push('importance >= ?');
    args.push(parseFloat(params.min_importance));
  }
  const where = conds.join(' AND ');

  const totalRows = await query(`SELECT COUNT(*) AS total FROM tenant_shop_memory WHERE ${where}`, args);
  const rows = await query(
    `SELECT id, tenant_id, memory_type, memory_content, memory_source, importance, create_time, update_time
     FROM tenant_shop_memory WHERE ${where}
     ORDER BY importance DESC, update_time DESC
     LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]
  );
  return { list: rows, total: totalRows[0].total, page, pageSize };
}

/**
 * 查询单条记忆详情
 */
async function detail(tenantId, id) {
  const rows = await query(
    'SELECT id, tenant_id, memory_type, memory_content, memory_source, importance, create_time, update_time FROM tenant_shop_memory WHERE tenant_id = ? AND id = ? AND deleted = 0 LIMIT 1',
    [tenantId, id]
  );
  if (!rows.length) throw new AppError(404, 404, '记忆不存在');
  return rows[0];
}

/**
 * 新增记忆
 * @param {number} tenantId
 * @param {object} body  { memory_type, memory_content, memory_source, importance }
 */
async function create(tenantId, body) {
  // 参数校验
  const validTypes = ['sales_data', 'user_decision', 'shop_attr', 'ai_summary'];
  if (!body.memory_type || !validTypes.includes(body.memory_type)) {
    throw new AppError(400, 400, 'memory_type 必须为: ' + validTypes.join(', '));
  }
  if (!body.memory_content) {
    throw new AppError(400, 400, 'memory_content 不能为空');
  }
  let content;
  if (typeof body.memory_content === 'string') {
    try { JSON.parse(body.memory_content); content = body.memory_content; } catch(e) { content = JSON.stringify({ text: body.memory_content }); }
  } else {
    content = JSON.stringify(body.memory_content);
  }
  const source = body.memory_source || 'user_chat';
  const importance = Math.min(Math.max(parseFloat(body.importance) || 5.0, 0), 10);

  const result = await query(
    'INSERT INTO tenant_shop_memory (tenant_id, memory_type, memory_content, memory_source, importance) VALUES (?, ?, ?, ?, ?)',
    [tenantId, body.memory_type, content, source, importance]
  );
  return { id: result.insertId };
}

/**
 * 更新记忆(只允许改 content / source / importance / type)
 */
async function update(tenantId, id, body) {
  // 先校验存在性(同时做租户隔离校验)
  await detail(tenantId, id);

  const sets = [];
  const args = [];

  if (body.memory_type) {
    const validTypes = ['sales_data', 'user_decision', 'shop_attr', 'ai_summary'];
    if (!validTypes.includes(body.memory_type)) {
      throw new AppError(400, 400, 'memory_type 必须为: ' + validTypes.join(', '));
    }
    sets.push('memory_type = ?');
    args.push(body.memory_type);
  }
  if (body.memory_content !== undefined) {
    let content;
  if (typeof body.memory_content === 'string') {
    try { JSON.parse(body.memory_content); content = body.memory_content; } catch(e) { content = JSON.stringify({ text: body.memory_content }); }
  } else {
    content = JSON.stringify(body.memory_content);
  }
    sets.push('memory_content = ?');
    args.push(content);
  }
  if (body.memory_source !== undefined) {
    sets.push('memory_source = ?');
    args.push(body.memory_source);
  }
  if (body.importance !== undefined) {
    const imp = Math.min(Math.max(parseFloat(body.importance) || 5.0, 0), 10);
    sets.push('importance = ?');
    args.push(imp);
  }

  if (sets.length === 0) {
    throw new AppError(400, 400, '无更新字段');
  }
  args.push(id, tenantId);
  await query(`UPDATE tenant_shop_memory SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, args);
  return { id };
}

/**
 * 删除记忆
 */
async function remove(tenantId, id) {
  await detail(tenantId, id); // 租户隔离校验
  await query('UPDATE tenant_shop_memory SET deleted = 1 WHERE id = ? AND tenant_id = ?', [id, tenantId]);
  return { id };
}

/**
 * 查询当前租户权重最高的N条记忆 —— 供AI Agent做店铺分析时注入prompt
 * 只返回精简字段,减少token消耗
 * @param {number} tenantId
 * @param {number} limit  取前N条,默认10
 */
async function listTopMemories(tenantId, limit = 10) {
  const rows = await query(
    `SELECT memory_type, memory_content, importance
     FROM tenant_shop_memory
     WHERE tenant_id = ? AND deleted = 0
     ORDER BY importance DESC, update_time DESC
     LIMIT ?`,
    [tenantId, Math.min(parseInt(limit, 10) || 10, 50)]
  );
  return rows;
}

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  listTopMemories,
};


