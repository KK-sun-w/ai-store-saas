// 🛒 商品运营 Agent
// 职责：分析商品信息，生成商品卖点、描述、上架文案；给出定价建议
const { callLlm } = require('../../utils/llm');
const { logAgentTask, fetchProducts, fetchSalesOrders } = require('./agentUtils');
const biz = require('../services/shopMemory.business');

const SYSTEM_PROMPT = `你是一位电商商品运营专家，精通卖点提炼、标题优化和差异化定价策略。请基于真实商品数据输出专业商品运营方案。

【报告模板】

# 门店商品运营诊断报告

---

## 一、商品矩阵总览
统计：在售 SKU 数、分类分布、价格带分布（低价 0-20 / 中价 20-50 / 高价 50+）

## 二、TOP 3 卖点提炼（每个商品）
对每个商品输出：
1. 核心卖点（30 字以内，直击痛点）
2. 短视频口播文案（15 秒版 / 30 秒版，带情绪钩子）
3. 电商详情页首屏文案（适合上架）

## 三、定价健康度诊断
| 商品 | 成本价 | 当前售价 | 毛利率 | 行业平均毛利 | 诊断 | 建议调整价 |
|------|--------|----------|--------|-------------|------|-----------|
| ... | ... | ... | ... | 35% | 偏低/合理/偏高 | ... |

## 四、商品优化 3 条建议
从名称/分类/单位/图片四个维度给出具体建议

【约束】所有数值基于真实数据库。只输出建议。`;

/**
 * 商品运营 Agent 主函数
 */
async function run(tenantId, userInput, taskId) {
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  console.log('[Product] 拉取商品数据');
  const products = await fetchProducts(tenantId);
  const salesOrders = await fetchSalesOrders(tenantId, 15);

  // 统计每个商品的销量
  const productSales = {};
  for (const o of salesOrders) {
    for (const item of (o.items || [])) {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { name: item.product_name, qty: 0, revenue: 0 };
      }
      productSales[item.product_id].qty += Number(item.quantity);
      productSales[item.product_id].revenue += Number(item.amount);
    }
  }

  const dataContext = JSON.stringify({
    products: products.map(p => ({
      id: p.id, name: p.name, sku: p.sku_code, category: p.category,
      unit: p.unit, cost: p.cost_price, sale: p.sale_price,
      stock: p.current_stock, status: p.status,
      sales: productSales[p.id] || null
    }))
  }, null, 0);

  console.log('[Product] 调用 LLM 生成运营建议');
  const result = await callLlm(memoryText + '\n' + SYSTEM_PROMPT,
    `用户请求: ${userInput}\n\n以下是当前门店的真实商品数据（含近期销量）：\n${dataContext}\n\n请基于以上数据给出商品运营建议。`, { tenantId });

  await logAgentTask({
    tenant_id: tenantId, task_id: taskId, agent_name: 'product',
    input_params: { user_input: userInput, product_count: products.length },
    agent_output: result, status: 'success',
  });

  return result;
}

module.exports = { run };

