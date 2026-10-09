// 🧾 采购建议 Agent
// 职责：结合库存+历史销量，生成采购清单草稿，给出采购建议
// 只输出建议，不自动下单
const { callLlm } = require('../../utils/llm');
const biz = require('../services/shopMemory.business');
const { logAgentTask, fetchProducts, fetchSalesOrders, fetchPurchaseOrders } = require('./agentUtils');

// ========== 采购建议系统提示词 ==========
const SYSTEM_PROMPT = `你是一位供应链采购专家，擅长基于销量预测和库存健康度生成精准采购计划。请输出专业采购建议清单。

【输出模板】

# 门店采购建议清单
> 生成依据：近 30 天销量 x 3 倍安全系数 + 库存预警
> 假设采购提前期：3 天

---

## 一、紧急补货（P0 - 本周必须下单）
| 商品 | SKU | 当前库存 | 预警线 | 日均销量 | 建议采购 | 预估金额 | 理由 |
|------|-----|----------|--------|----------|----------|----------|------|
| ... | ... | ... | ... | ... | ... | ... | 已低于预警 |

## 二、常规补货（P1 - 两周内下单）同上格式
## 三、暂缓/暂停采购（P2 - 滞销/积压）
## 四、采购预算汇总
- P0 紧急采购：约 X 元
- P1 常规采购：约 X 元
- 总预算需求：约 X 元

## 五、供应商建议

【约束】数量计算必须基于真实销量数据。只输出建议清单，绝不自动创建进货单。`;

/**
 * 采购建议 Agent 主函数
 */
async function run(tenantId, userInput, taskId) {
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  console.log('[Procurement] 拉取库存和销售数据');
  const products = await fetchProducts(tenantId);
  const salesOrders = await fetchSalesOrders(tenantId, 30);
  const purchaseOrders = await fetchPurchaseOrders(tenantId, 10);

  // 统计每个商品近30天销量
  const productSales = {};
  for (const o of salesOrders) {
    for (const item of (o.items || [])) {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { qty: 0, revenue: 0, orders: 0 };
      }
      productSales[item.product_id].qty += Number(item.quantity);
      productSales[item.product_id].revenue += Number(item.amount);
      productSales[item.product_id].orders += 1;
    }
  }

  const dataContext = JSON.stringify({
    products: products.map(p => ({
      id: p.id, name: p.name, sku: p.sku_code, category: p.category,
      stock: p.current_stock, warning: p.stock_warning_threshold,
      cost: p.cost_price, sale: p.sale_price, unit: p.unit,
      sales: productSales[p.id] || { qty: 0, revenue: 0, orders: 0 }
    })),
    recent_purchases: purchaseOrders.map(o => ({
      no: o.order_no, supplier: o.supplier_name, amount: o.total_amount,
      time: o.purchase_time, status: o.status,
      items: (o.items || []).map(i => ({ name: i.product_name, qty: i.quantity, cost: i.unit_cost }))
    }))
  }, null, 0);

  console.log('[Procurement] 调用 LLM 生成采购建议');
  const result = await callLlm(memoryText + '\n' + SYSTEM_PROMPT,
    `用户请求: ${userInput}\n\n以下是当前门店的真实库存和销售数据（JSON格式）：\n${dataContext}\n\n请基于以上数据生成采购建议清单。`, { tenantId });

  await logAgentTask({
    tenant_id: tenantId, task_id: taskId, agent_name: 'procurement',
    input_params: { user_input: userInput, product_count: products.length },
    agent_output: result, status: 'success',
  });

  return result;
}

module.exports = { run };


