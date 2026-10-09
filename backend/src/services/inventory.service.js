// 库存盘点调整业务逻辑
// 核心约束:
//   1. 所有 SQL 必须带 tenant_id 条件,严格多租户隔离;
//   2. 库存变更必须走 inventory_log 流水,由程序计算 before/after_stock;
//   3. 调整后库存不能小于 0;
//   4. 盘点调整与商品库存更新在同一事务内完成,保证一致性。
const { getConnection } = require('../config/db');
const AppError = require('../utils/appError');

// 数量四舍五入保留 2 位,避免浮点误差
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * 库存盘点调整
 * @param {number} tenantId  租户ID(来自 JWT,可信)
 * @param {number} productId 商品ID
 * @param {number} adjustNum 调整数量(正数加库存,负数扣减库存)
 * @param {string} remark    备注(盘点原因等)
 * @returns {Promise<object>} 调整前后库存信息
 */
async function inventoryCheck(tenantId, productId, adjustNum, remark) {
  const adj = Number(adjustNum);
  if (!Number.isFinite(adj)) {
    throw new AppError(400, 400, '调整数量不合法');
  }
  if (adj === 0) {
    throw new AppError(400, 400, '调整数量不能为 0');
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // 锁定商品行(防止并发),读取调整前库存
    const [pRows] = await conn.query(
      'SELECT id, current_stock FROM product WHERE tenant_id = ? AND id = ? FOR UPDATE',
      [tenantId, productId]
    );
    if (!pRows.length) {
      throw new AppError(404, 404, '商品不存在');
    }

    const beforeStock = Number(pRows[0].current_stock);
    const afterStock = round2(beforeStock + adj);

    // 调整后库存不能小于 0
    if (afterStock < 0) {
      throw new AppError(409, 409, '调整后库存不能小于 0');
    }

    // 更新商品库存
    await conn.query('UPDATE product SET current_stock = ? WHERE tenant_id = ? AND id = ?', [
      afterStock,
      tenantId,
      productId,
    ]);

    // 写入盘点流水(change_type='check'),保存调整前后库存与备注
    await conn.query(
      `INSERT INTO inventory_log
         (tenant_id, product_id, change_type, change_quantity, before_stock, after_stock, ref_type, remark)
       VALUES (?, ?, 'check', ?, ?, ?, 'adjust', ?)`,
      [tenantId, productId, round2(adj), beforeStock, afterStock, remark || '']
    );

    await conn.commit();
    return {
      productId: Number(productId),
      beforeStock,
      adjustNum: round2(adj),
      afterStock,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { inventoryCheck };