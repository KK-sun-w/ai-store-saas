// 销售单业务逻辑
// 核心约束:销售开单即出库,生成 inventory_log,由程序计算库存与毛利。
const { query, getConnection } = require('../config/db');
const AppError = require('../utils/appError');
const { getPageParams } = require('../utils/page');

function round2(n) {
  return Math.round(n * 100) / 100;
}

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
  const totalRows = await query(`SELECT COUNT(*) AS total FROM sales_order WHERE ${where}`, args);
  const rows = await query(
    `SELECT * FROM sales_order WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]
  );
  return { list: rows, total: totalRows[0].total, page, pageSize };
}

// 详情(含明细)
async function detail(tenantId, orderId) {
  const rows = await query(
    'SELECT * FROM sales_order WHERE tenant_id = ? AND id = ? LIMIT 1',
    [tenantId, orderId]
  );
  if (!rows.length) {
    throw new AppError(404, 404, '销售单不存在');
  }
  const items = await query(
    'SELECT * FROM sales_order_item WHERE tenant_id = ? AND sales_order_id = ?',
    [tenantId, orderId]
  );
  return { ...rows[0], items };
}

// 创建销售单:扣库存 + 成本快照 + 计算毛利 + 写流水
async function create(tenantId, body) {
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 400, '销售明细不能为空');
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const orderNo = genOrderNo('SO');
    const [orderResult] = await conn.query(
      `INSERT INTO sales_order
         (tenant_id, order_no, customer_name, total_amount, total_cost, gross_profit, status, sales_time, remark)
       VALUES (?, ?, ?, 0, 0, 0, 1, ?, ?)`,
      [tenantId, orderNo, body.customer_name || '', body.sales_time || null, body.remark || '']
    );
    const orderId = orderResult.insertId;

    let totalAmount = 0;
    let totalCost = 0;
    let grossProfit = 0;

    for (const it of items) {
      const qty = Number(it.quantity);
      const price = Number(it.unit_price);
      if (!Number.isFinite(qty) || qty <= 0) throw new AppError(400, 400, '销售数量必须大于 0');
      if (!Number.isFinite(price) || price < 0) throw new AppError(400, 400, '销售单价不合法');

      // 锁定商品行,校验归属与库存
      const [pRows] = await conn.query(
        'SELECT id, cost_price, current_stock FROM product WHERE tenant_id = ? AND id = ? AND deleted = 0 FOR UPDATE',
        [tenantId, it.product_id]
      );
      if (!pRows.length) throw new AppError(404, 404, `商品(${it.product_id})不存在`);

      const product = pRows[0];
      const oldStock = Number(product.current_stock);
      if (oldStock < qty) {
        throw new AppError(409, 409, '库存不足,无法完成销售');
      }

      const unitCost = Number(product.cost_price); // 成本快照(生产建议改为移动加权平均)
      const newStock = round2(oldStock - qty);
      const amount = round2(qty * price);
      const costAmount = round2(qty * unitCost);
      const profit = round2(amount - costAmount);

      // 扣减库存
      await conn.query('UPDATE product SET current_stock = ? WHERE tenant_id = ? AND id = ?', [
        newStock,
        tenantId,
        it.product_id,
      ]);

      // 写入销售明细
      await conn.query(
        `INSERT INTO sales_order_item
           (tenant_id, sales_order_id, product_id, quantity, unit_price, unit_cost, amount, cost_amount, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, orderId, it.product_id, qty, price, unitCost, amount, costAmount, profit]
      );

      // 写库存流水:销售出库(change_type=2),变动数量为负
      await conn.query(
        `INSERT INTO inventory_log
           (tenant_id, product_id, change_type, change_quantity, before_stock, after_stock, ref_type, ref_id)
         VALUES (?, ?, 2, ?, ?, ?, 'sales', ?)`,
        [tenantId, it.product_id, -qty, oldStock, newStock, orderId]
      );

      totalAmount = round2(totalAmount + amount);
      totalCost = round2(totalCost + costAmount);
      grossProfit = round2(grossProfit + profit);
    }

    // 回写汇总
    await conn.query(
      'UPDATE sales_order SET total_amount = ?, total_cost = ?, gross_profit = ? WHERE tenant_id = ? AND id = ?',
      [totalAmount, totalCost, grossProfit, tenantId, orderId]
    );

    await conn.commit();
    return {
      id: orderId,
      order_no: orderNo,
      total_amount: totalAmount,
      total_cost: totalCost,
      gross_profit: grossProfit,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { list, detail, create };
