// 进货单业务逻辑
// 核心约束:库存变更只通过「确认入库」生成 inventory_log 流水,由程序计算更新 current_stock。
const { query, getConnection } = require('../config/db');
const AppError = require('../utils/appError');
const { getPageParams } = require('../utils/page');

// 金额/数量四舍五入保留 2 位,避免浮点误差
function round2(n) {
  return Math.round(n * 100) / 100;
}

// 生成单据号(前缀 + 时间戳 + 随机位;生产建议改用雪花 ID 或 DB 序列)
function genOrderNo(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// 列表
async function list(tenantId, params = {}) {
  const { page, pageSize, offset } = getPageParams(params);
  const conds = ['tenant_id = ?'];
  const args = [tenantId];
  if (params.status !== undefined && params.status !== '') {
    conds.push('status = ?');
    args.push(Number(params.status));
  }
  if (params.order_no) {
    conds.push('order_no LIKE ?');
    args.push(`%${params.order_no}%`);
  }
  const where = conds.join(' AND ');
  const totalRows = await query(`SELECT COUNT(*) AS total FROM purchase_order WHERE ${where}`, args);
  const rows = await query(
    `SELECT * FROM purchase_order WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]
  );
  return { list: rows, total: totalRows[0].total, page, pageSize };
}

// 详情(含明细)
async function detail(tenantId, orderId) {
  const rows = await query(
    'SELECT * FROM purchase_order WHERE tenant_id = ? AND id = ? LIMIT 1',
    [tenantId, orderId]
  );
  if (!rows.length) {
    throw new AppError(404, 404, '进货单不存在');
  }
  const items = await query(
    'SELECT * FROM purchase_order_item WHERE tenant_id = ? AND purchase_order_id = ?',
    [tenantId, orderId]
  );
  return { ...rows[0], items };
}

// 创建进货单(状态=1 草稿,不涉及库存;明细金额由程序计算)
async function create(tenantId, body) {
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 400, '进货明细不能为空');
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const orderNo = genOrderNo('PO');
    let totalAmount = 0;

    // 创建主单(总金额先置 0,汇总后回写)
    const [orderResult] = await conn.query(
      `INSERT INTO purchase_order (tenant_id, order_no, supplier_name, total_amount, status, purchase_time, remark)
       VALUES (?, ?, ?, 0, 1, ?, ?)`,
      [tenantId, orderNo, body.supplier_name || '', body.purchase_time || null, body.remark || '']
    );
    const orderId = orderResult.insertId;

    // 逐条校验并写入明细
    for (const it of items) {
      const qty = Number(it.quantity);
      const cost = Number(it.unit_cost);
      if (!Number.isFinite(qty) || qty <= 0) throw new AppError(400, 400, '进货数量必须大于 0');
      if (!Number.isFinite(cost) || cost < 0) throw new AppError(400, 400, '进货单价不合法');

      // 校验商品属于当前租户(防止写入他人商品)
      const [p] = await conn.query('SELECT id FROM product WHERE tenant_id = ? AND id = ? AND deleted = 0 LIMIT 1', [
        tenantId,
        it.product_id,
      ]);
      if (!p.length) throw new AppError(404, 404, `商品(${it.product_id})不存在`);

      const amount = round2(qty * cost);
      totalAmount = round2(totalAmount + amount);

      await conn.query(
        `INSERT INTO purchase_order_item (tenant_id, purchase_order_id, product_id, quantity, unit_cost, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, orderId, it.product_id, qty, cost, amount]
      );
    }

    // 回写汇总金额
    await conn.query('UPDATE purchase_order SET total_amount = ? WHERE tenant_id = ? AND id = ?', [
      totalAmount,
      tenantId,
      orderId,
    ]);

    await conn.commit();
    return { id: orderId, order_no: orderNo, total_amount: totalAmount };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// 确认入库(状态 1 草稿 -> 2 已入库):更新库存 + 写 inventory_log,同一事务
async function confirm(tenantId, orderId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // 锁定主单,防并发重复确认
    const [orders] = await conn.query(
      'SELECT id, status FROM purchase_order WHERE tenant_id = ? AND id = ? FOR UPDATE',
      [tenantId, orderId]
    );
    if (!orders.length) throw new AppError(404, 404, '进货单不存在');
    const order = orders[0];
    if (order.status === 2) throw new AppError(409, 409, '进货单已入库,不可重复确认');
    if (order.status !== 1) throw new AppError(409, 409, '进货单状态不允许入库');

    // 读取明细
    const [items] = await conn.query(
      'SELECT product_id, quantity FROM purchase_order_item WHERE tenant_id = ? AND purchase_order_id = ?',
      [tenantId, orderId]
    );

    // 逐条更新库存并写流水
    for (const it of items) {
      const [pRows] = await conn.query(
        'SELECT current_stock FROM product WHERE tenant_id = ? AND id = ? AND deleted = 0 FOR UPDATE',
        [tenantId, it.product_id]
      );
      if (!pRows.length) throw new AppError(404, 404, `商品(${it.product_id})不存在`);

      const oldStock = Number(pRows[0].current_stock);
      const newStock = round2(oldStock + Number(it.quantity)); // 入库增加

      await conn.query('UPDATE product SET current_stock = ? WHERE tenant_id = ? AND id = ?', [
        newStock,
        tenantId,
        it.product_id,
      ]);

      // 库存流水:进货入库(change_type=1),变动数量为正
      await conn.query(
        `INSERT INTO inventory_log
           (tenant_id, product_id, change_type, change_quantity, before_stock, after_stock, ref_type, ref_id)
         VALUES (?, ?, 1, ?, ?, ?, 'purchase', ?)`,
        [tenantId, it.product_id, it.quantity, oldStock, newStock, orderId]
      );
    }

    // 更新状态为已入库
    await conn.query('UPDATE purchase_order SET status = 2 WHERE tenant_id = ? AND id = ?', [tenantId, orderId]);

    await conn.commit();
    return { id: orderId, status: 2 };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { list, detail, create, confirm };
