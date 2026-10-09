// 商品业务逻辑(全接口以 tenant_id 隔离)
const { query, getConnection } = require('../config/db');
const AppError = require('../utils/appError');
const { getPageParams } = require('../utils/page');
 
// 金额/数量四舍五入保留 2 位,避免浮点误差
function round2(n) {
  return Math.round(n * 100) / 100;
}
 
// 商品可对外读写的字段白名单
const SELECT_FIELDS = `id, tenant_id, sku_code, name, category, unit, barcode,
  sale_price, cost_price, current_stock, stock_warning_threshold, status,
  create_time, update_time`;
 
// 列表(分页 + 关键字/分类过滤)
async function list(tenantId, params = {}, context = {}) {
  const { page, pageSize, offset } = getPageParams(params);
  const conds = ['tenant_id = ?', 'deleted = 0'];
  const args = [tenantId];
 
  if (params.keyword) {
    conds.push('(name LIKE ? OR sku_code LIKE ?)');
    args.push(`%${params.keyword}%`, `%${params.keyword}%`);
  }
  if (params.category) {
    conds.push('category = ?');
    args.push(params.category);
  }
  if (params.status !== undefined && params.status !== '') {
    conds.push('status = ?');
    args.push(Number(params.status));
  }
 
  const where = conds.join(' AND ');
  const totalRows = await query(`SELECT COUNT(*) AS total FROM product WHERE ${where}`, args);
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM product WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]
  );
  // 店员角色过滤 cost_price (后端强制,不能只靠前端)
  const visibleList = (context?.role === 'staff')
    ? rows.map(r => { const { cost_price, ...rest } = r; return rest; })
    : rows;
  return { list: visibleList, total: totalRows[0].total, page, pageSize };
}
 
// 详情(按 tenant_id + id 定位,防止越权)
async function detail(tenantId, id, context = {}) {
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM product WHERE tenant_id = ? AND id = ? AND deleted = 0 LIMIT 1`,
    [tenantId, id]
  );
  if (!rows.length) {
    throw new AppError(404, 404, '商品不存在');
  }
  return rows[0];
}
 
// 创建商品
// 支持 initial_stock(期初库存,可选,不传为 0):
//   - initial_stock > 0 时,current_stock 直接置为 initial_stock,并写入一条 change_type='init' 的期初流水。
//   - 期初库存仅在新建商品时生效,编辑商品(update)不处理 initial_stock。
async function create(tenantId, body) {
  // 防御：body 未传参则置为空对象，防止undefined访问属性报错
  const data = body || {};
  const initStock = round2(Number(data.initial_stock) || 0);
  if (initStock < 0) {
    throw new AppError(400, 400, '期初库存不能为负数');
  }
 
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
 
    // sku_code 没传或空时自动生成 (格式: SKU + 时间戳末10位 + 2位随机)
    let skuCode = data.sku_code;
    if (!skuCode || !skuCode.trim()) {
      skuCode = 'SKU' + Date.now().toString().slice(-10) + Math.floor(Math.random() * 100).toString().padStart(2, '0');
    }

    // 插入商品,current_stock 直接设为期初库存
    const [r] = await conn.query(
      `INSERT INTO product
         (tenant_id, sku_code, name, category, unit, barcode, image_url, sale_price, wholesale_price, supplier, remark, cost_price, current_stock, stock_warning_threshold, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        skuCode,
        data.name,
        data.category || '',
        data.unit || '件',
        data.barcode || '',
        data.image_url || null,
        data.sale_price ?? 0,
        data.cost_price ?? 0,
        initStock,
        data.stock_warning_threshold ?? 0,
        data.status ?? 1,
      ]
    );
    const productId = r.insertId;
 
    // 期初库存 > 0 时写入期初流水(change_type='init')
    if (initStock > 0) {
      await conn.query(
        `INSERT INTO inventory_log
           (tenant_id, product_id, change_type, change_quantity, before_stock, after_stock, ref_type, remark)
         VALUES (?, ?, 'init', ?, 0, ?, 'init', ?)`,
        [tenantId, productId, initStock, initStock, '期初库存入库']
      );
    }
 
    await conn.commit();
    return { id: productId, current_stock: initStock };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
 
// 更新商品(白名单字段,current_stock 绝对不在可更新列,前端无法直接改库存)
const UPDATABLE_FIELDS = [
  'sku_code', 'name', 'category', 'unit', 'barcode',
  'sale_price', 'cost_price', 'stock_warning_threshold', 'status',
];
 
async function update(tenantId, id, body) {
  await detail(tenantId, id); // 校验存在且归属当前租户
  const data = body || {};
  const sets = [];
  const args = [];
  for (const f of UPDATABLE_FIELDS) {
    if (f in data) {
      sets.push(`${f} = ?`);
      args.push(data[f]);
    }
  }
  if (!sets.length) {
    throw new AppError(400, 400, '没有可更新的字段');
  }
 
  args.push(tenantId, id);
  await query(`UPDATE product SET ${sets.join(', ')} WHERE tenant_id = ? AND id = ?`, args);
  return { id: Number(id) };
}
 
// 删除商品(物理删除。生产建议改用 status=0 软删以保留历史单据可追溯性)
async function remove(tenantId, id) {
  await detail(tenantId, id);
  await query("UPDATE product SET deleted = 1, sku_code = CONCAT(sku_code, '_del_', id) WHERE tenant_id = ? AND id = ?", [tenantId, id]);
  return { id: Number(id) };
}
 

// 按条码查询商品
async function getByBarcode(tenantId, barcode) {
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM product WHERE tenant_id = ? AND barcode = ? AND deleted = 0 LIMIT 1`,
    [tenantId, barcode]
  );
  return rows[0] || null;
}
module.exports = { list, detail, getByBarcode, create, update, remove };



