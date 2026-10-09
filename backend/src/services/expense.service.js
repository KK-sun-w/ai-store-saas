// 开销记录业务逻辑
const { query } = require('../config/db');
const AppError = require('../utils/appError');
const { getPageParams } = require('../utils/page');

async function list(tenantId, params = {}) {
  const { page, pageSize, offset } = getPageParams(params);
  const conds = ['tenant_id = ?', 'deleted = 0'];
  const args = [tenantId];
  if (params.expense_type) {
    conds.push('expense_type = ?');
    args.push(params.expense_type);
  }
  const where = conds.join(' AND ');
  const totalRows = await query(`SELECT COUNT(*) AS total FROM expense WHERE ${where}`, args);
  const rows = await query(
    `SELECT * FROM expense WHERE ${where} ORDER BY expense_time DESC, id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]
  );
  return { list: rows, total: totalRows[0].total, page, pageSize };
}

async function detail(tenantId, id) {
  const rows = await query('SELECT * FROM expense WHERE tenant_id = ? AND id = ? AND deleted = 0 LIMIT 1', [tenantId, id]);
  if (!rows.length) throw new AppError(404, 404, '开销记录不存在');
  return rows[0];
}

async function create(tenantId, body) {
  const r = await query(
    `INSERT INTO expense (tenant_id, expense_type, amount, expense_time, payee, payment_method, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      body.expense_type,
      body.amount,
      body.expense_time || null,
      body.payee || '',
      body.payment_method || '',
      body.remark || '',
    ]
  );
  return { id: r.insertId };
}

const UPDATABLE_FIELDS = ['expense_type', 'amount', 'expense_time', 'payee', 'payment_method', 'remark'];

async function update(tenantId, id, body) {
  await detail(tenantId, id);
  const sets = [];
  const args = [];
  for (const f of UPDATABLE_FIELDS) {
    if (f in body) {
      sets.push(`${f} = ?`);
      args.push(body[f]);
    }
  }
  if (!sets.length) throw new AppError(400, 400, '没有可更新的字段');
  args.push(tenantId, id);
  await query(`UPDATE expense SET ${sets.join(', ')} WHERE tenant_id = ? AND id = ?`, args);
  return { id: Number(id) };
}

async function remove(tenantId, id) {
  await detail(tenantId, id);
  await query('UPDATE expense SET deleted = 1 WHERE tenant_id = ? AND id = ?', [tenantId, id]);
  return { id: Number(id) };
}

module.exports = { list, detail, create, update, remove };
