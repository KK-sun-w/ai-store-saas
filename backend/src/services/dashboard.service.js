// 仪表盘统计服务
const { pool } = require('../config/db');

function round2(v) {
  const n = Number(v) || 0;
  return Math.round(n * 100) / 100;
}

/**
 * 获取仪表盘总览统计
 * @param {number} tenantId
 */
async function getOverview(tenantId) {
  // 1) 库存总数: 所有商品 current_stock 之和
  const [stockRows] = await pool.query(
    'SELECT COALESCE(SUM(current_stock), 0) AS total_stock FROM product WHERE tenant_id = ? AND deleted = 0',
    [tenantId]
  );
  const totalStock = round2(stockRows[0].total_stock);

  // 2) 今日销售额 + 今日利润 (sales_time 为 NULL 时回退到 create_time)
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const [todayRows] = await pool.query(
    `SELECT
        COALESCE(SUM(total_amount), 0) AS today_sales,
        COALESCE(SUM(gross_profit), 0) AS today_profit,
        COUNT(*) AS today_order_count
     FROM sales_order
     WHERE tenant_id = ? AND status = 1
       AND COALESCE(sales_time, create_time) >= ?
       AND COALESCE(sales_time, create_time) < ?`,
    [tenantId, todayStart, tomorrowStart]
  );

  // 3) 本月销售额 + 本月利润
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const [monthRows] = await pool.query(
    `SELECT
        COALESCE(SUM(total_amount), 0) AS month_sales,
        COALESCE(SUM(gross_profit), 0) AS month_profit,
        COUNT(*) AS month_order_count
     FROM sales_order
     WHERE tenant_id = ? AND status = 1
       AND COALESCE(sales_time, create_time) >= ?
       AND COALESCE(sales_time, create_time) < ?`,
    [tenantId, monthStart, nextMonthStart]
  );

  // 4) 商品总数
  const [prodRows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM product WHERE tenant_id = ? AND deleted = 0',
    [tenantId]
  );

  return {
    total_stock: totalStock,
    product_count: prodRows[0].cnt,
    today_sales: round2(todayRows[0].today_sales),
    today_profit: round2(todayRows[0].today_profit),
    today_order_count: todayRows[0].today_order_count,
    month_sales: round2(monthRows[0].month_sales),
    month_profit: round2(monthRows[0].month_profit),
    month_order_count: monthRows[0].month_order_count,
  };
}

/**
 * 获取近 N 个月销售额对比(默认 12 个月,含本月)
 * 返回 [{month: "2025-09", sales: 1234.56}]
 */
async function getMonthlySales(tenantId, months = 12) {
  const now = new Date();
  const yearMonth = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    rows.push({ month: yearMonth(d), _start: d });
  }

  const firstMonth = rows[0]._start;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [agg] = await pool.query(
    `SELECT DATE_FORMAT(COALESCE(sales_time, create_time), '%Y-%m') AS ym,
            COALESCE(SUM(total_amount), 0) AS sales,
            COUNT(*) AS order_count
     FROM sales_order
     WHERE tenant_id = ? AND status = 1
       AND COALESCE(sales_time, create_time) >= ?
       AND COALESCE(sales_time, create_time) < ?
     GROUP BY DATE_FORMAT(COALESCE(sales_time, create_time), '%Y-%m')`,
    [tenantId, firstMonth, lastMonth]
  );

  const map = {};
  for (const r of agg) map[r.ym] = r;

  return rows.map((r) => {
    const hit = map[r.month] || { sales: 0, order_count: 0 };
    return {
      month: r.month,
      sales: round2(hit.sales),
      order_count: hit.order_count,
    };
  });
}

module.exports = { getOverview, getMonthlySales };

