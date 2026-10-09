// Agent 专用聚合查询控制器
// 所有接口强制 tenant_id 隔离 (来自 JWT), 返回系统提示词要求的结构化数据
// 只读: 仅 SELECT, 不做任何写操作
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { query } = require('../config/db');

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// 解析日期范围, 默认近30天
function parseDateRange(query) {
  const now = new Date();
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const defaultStart = new Date(now.getTime() - 30 * 86400000);
  const start = query.start_date ? new Date(query.start_date) : defaultStart;
  const end = query.end_date ? new Date(new Date(query.end_date).getTime() + 86400000) : defaultEnd;
  return { start, end };
}

/**
 * GET /agent-query/sales?start_date=&end_date=
 * 返回: 营收概况、单品销量、客户购买记录、热销排行
 */
exports.querySales = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { start, end } = parseDateRange(req.query);

  // 1. 营收概况
  const [summary] = await query(
    `SELECT COALESCE(SUM(total_amount),0) AS total_revenue,
            COALESCE(SUM(total_cost),0) AS total_cost,
            COALESCE(SUM(gross_profit),0) AS gross_profit,
            COUNT(*) AS order_count
     FROM sales_order
     WHERE tenant_id = ? AND status = 1
       AND COALESCE(sales_time, create_time) >= ?
       AND COALESCE(sales_time, create_time) < ?`,
    [tenantId, start, end]
  );

  // 2. 单品销量排行 TOP 20
  const productRanking = await query(
    `SELECT p.name AS product_name, p.sku_code,
            SUM(soi.quantity) AS total_quantity,
            SUM(soi.amount) AS total_revenue
     FROM sales_order_item soi
     JOIN sales_order so ON so.id = soi.sales_order_id
     JOIN product p ON p.id = soi.product_id
     WHERE so.tenant_id = ? AND so.status = 1
       AND COALESCE(so.sales_time, so.create_time) >= ?
       AND COALESCE(so.sales_time, so.create_time) < ?
     GROUP BY p.id
     ORDER BY total_quantity DESC
     LIMIT 20`,
    [tenantId, start, end]
  );

  // 3. 客户购买记录
  const customerRecords = await query(
    `SELECT customer_name, COUNT(*) AS order_count,
            COALESCE(SUM(total_amount),0) AS total_spent
     FROM sales_order
     WHERE tenant_id = ? AND status = 1
       AND COALESCE(sales_time, create_time) >= ?
       AND COALESCE(sales_time, create_time) < ?
       AND customer_name IS NOT NULL AND customer_name != ''
     GROUP BY customer_name
     ORDER BY total_spent DESC
     LIMIT 20`,
    [tenantId, start, end]
  );

  // 4. 近期订单明细 (最近30条)
  const recentOrders = await query(
    `SELECT order_no, customer_name, total_amount, gross_profit,
            COALESCE(sales_time, create_time) AS order_time
     FROM sales_order
     WHERE tenant_id = ? AND status = 1
       AND COALESCE(sales_time, create_time) >= ?
       AND COALESCE(sales_time, create_time) < ?
     ORDER BY order_time DESC
     LIMIT 30`,
    [tenantId, start, end]
  );

  return ok(res, {
    date_range: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
    summary: {
      total_revenue: round2(summary.total_revenue),
      total_cost: round2(summary.total_cost),
      gross_profit: round2(summary.gross_profit),
      order_count: summary.order_count,
    },
    product_ranking: productRanking.map(r => ({
      product_name: r.product_name,
      sku_code: r.sku_code,
      total_quantity: round2(r.total_quantity),
      total_revenue: round2(r.total_revenue),
    })),
    customer_records: customerRecords.map(r => ({
      customer_name: r.customer_name,
      order_count: r.order_count,
      total_spent: round2(r.total_spent),
    })),
    recent_orders: recentOrders.map(r => ({
      order_no: r.order_no,
      customer_name: r.customer_name,
      total_amount: round2(r.total_amount),
      gross_profit: round2(r.gross_profit),
      order_time: r.order_time,
    })),
  });
});

/**
 * GET /agent-query/inventory
 * 返回: 所有商品库存、成本、积压库存、低库存预警、周转信息
 */
exports.queryInventory = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;

  const products = await query(
    `SELECT id, name, sku_code, category, barcode, image_url,
            sale_price, cost_price, current_stock, stock_warning_threshold, status
     FROM product
     WHERE tenant_id = ? AND deleted = 0
     ORDER BY current_stock ASC`,
    [tenantId]
  );

  // 统计
  let totalStockValue = 0;
  const lowStock = [];
  const stagnant = []; // 库存 > 0 但无近期销量的 (简化: 库存>预警阈值*2 视为可能积压)

  for (const p of products) {
    totalStockValue += round2(p.cost_price) * Number(p.current_stock || 0);
    const stock = Number(p.current_stock || 0);
    const threshold = Number(p.stock_warning_threshold || 0);
    if (stock <= threshold) {
      lowStock.push({
        product_name: p.name, sku_code: p.sku_code,
        current_stock: stock, warning_threshold: threshold,
      });
    }
    if (stock > threshold * 3 && threshold > 0) {
      stagnant.push({
        product_name: p.name, sku_code: p.sku_code,
        current_stock: stock, warning_threshold: threshold,
      });
    }
  }

  return ok(res, {
    total_products: products.length,
    total_stock_value: round2(totalStockValue),
    low_stock_warnings: lowStock,
    stagnant_inventory: stagnant,
    products: products.map(p => ({
      id: p.id, name: p.name, sku_code: p.sku_code,
      category: p.category, barcode: p.barcode,
      sale_price: round2(p.sale_price), cost_price: round2(p.cost_price),
      current_stock: Number(p.current_stock || 0),
      stock_warning_threshold: Number(p.stock_warning_threshold || 0),
      status: p.status,
    })),
  });
});

/**
 * GET /agent-query/expenses?start_date=&end_date=
 * 返回: 时间段所有开销记录
 */
exports.queryExpenses = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { start, end } = parseDateRange(req.query);

  const rows = await query(
    `SELECT id, expense_type, amount, expense_time, payee, payment_method, remark
     FROM expense
     WHERE tenant_id = ? AND deleted = 0
       AND expense_time >= ? AND expense_time < ?
     ORDER BY expense_time DESC`,
    [tenantId, start, end]
  );

  let total = 0;
  const byType = {};
  for (const r of rows) {
    total += Number(r.amount || 0);
    byType[r.expense_type] = (byType[r.expense_type] || 0) + Number(r.amount || 0);
  }

  return ok(res, {
    date_range: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
    total_expense: round2(total),
    by_type: Object.entries(byType).map(([type, amt]) => ({ expense_type: type, amount: round2(amt) })),
    records: rows.map(r => ({
      id: r.id, expense_type: r.expense_type,
      amount: round2(r.amount), expense_time: r.expense_time,
      payee: r.payee, payment_method: r.payment_method, remark: r.remark,
    })),
  });
});