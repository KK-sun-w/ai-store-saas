// 库存经营 Agent
// 职责：读取数据库库存、销售历史；识别滞销商品、低库存预警，给出补货建议
// 只读不写：不修改任何业务数据
const { callLlm } = require('../../utils/llm');
const { logAgentTask, fetchProducts, fetchInventoryLogs, fetchSalesOrders } = require('./agentUtils');
const biz = require('../services/shopMemory.business');

const SYSTEM_PROMPT = `你是一位拥有 10 年零售行业经验的资深数据分析师，擅长进销存精细化管理。请以专业商业分析师视角输出库存分析报告。

【报告模板 - 必须严格按此结构输出】

# 门店库存经营分析报告
> 分析日期：今日
> 数据覆盖：近 30 天进销存 + 近 20 笔销售
> 分析师：AI 经营智能体

---

## 一、库存健康度仪表盘
| 指标 | 数值 | 行业基准 | 健康度 |
|------|------|----------|--------|
| SKU 总数 | X 个 | - | - |
| 有效在售 SKU | X 个 | - | - |
| 库存总件数 | X 件 | - | - |
| 库存总成本 | X 元 | - | - |
| 库存总货值（售价） | X 元 | - | - |
| 整体毛利率 | X% | 30-40% | 健康/偏低/偏高 |
| 预估周转天数 | X 天 | 15-30 天 | 健康/偏慢/异常 |

## 二、ABC 库存分层
- A 类：TOP 20% SKU，贡献约 80% 销售额，重点保障
- B 类：中间 60% SKU，常规水位
- C 类：长尾 SKU，贡献 5% 以下，考虑清仓

## 三、滞销黑名单 和 低库存红色预警
### 3.1 滞销商品 - 库存 > 0 但近 30 天零销售，标注积压资金
### 3.2 低库存预警 - current_stock <= warning_threshold，按断货风险排序

## 四、补货优先级清单（核心输出）
公式：建议补货量 = 近 7 天日均销量 x 3 + 安全库存 x 3 - 当前库存
| 优先级 | 商品名称 | SKU | 当前库存 | 建议补货 | 预估采购额 | 理由 |
|--------|----------|-----|----------|----------|------------|------|
| P0 紧急 | ... | ... | ... | ... | ... | 断货在即 |

## 五、3 条可执行行动建议

【约束】数字必须来自真实数据库 JSON，严禁编造。只输出建议，绝不执行写操作。`;

/**
 * 库存经营 Agent 主函数
 */
async function run(tenantId, userInput, taskId) {
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  const products = await fetchProducts(tenantId);
  const inventoryLogs = await fetchInventoryLogs(tenantId, 30);
  const salesOrders = await fetchSalesOrders(tenantId, 20);

  const dataContext = JSON.stringify({
    products: products.map(p => ({
      id: p.id, name: p.name, sku: p.sku_code, category: p.category,
      stock: p.current_stock, warning: p.stock_warning_threshold,
      cost: p.cost_price, sale: p.sale_price, status: p.status
    })),
    recent_inventory_changes: inventoryLogs.slice(0, 15).map(l => ({
      product: l.product_name, type: l.change_type, qty: l.change_quantity,
      before: l.before_stock, after: l.after_stock, time: l.create_time
    })),
    recent_sales: salesOrders.slice(0, 10).map(o => ({
      no: o.order_no, customer: o.customer_name, amount: o.total_amount,
      profit: o.gross_profit, time: o.sales_time || o.create_time,
      items: (o.items || []).map(i => ({ name: i.product_name, qty: i.quantity, amount: i.amount }))
    }))
  }, null, 0);

  const result = await callLlm(memoryText + '\n' + SYSTEM_PROMPT,
    `用户请求: ${userInput}

以下是当前门店的真实业务数据（JSON格式）：
${dataContext}

请基于以上数据给出库存分析报告。`, { tenantId });

  await logAgentTask({
    tenant_id: tenantId, task_id: taskId, agent_name: 'inventory',
    input_params: { user_input: userInput, product_count: products.length },
    agent_output: result, status: 'success',
  });

  return result;
}

module.exports = { run };

