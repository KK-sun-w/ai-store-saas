// 📊 销售分析 Agent
// 职责：读取销售订单数据，做经营分析：热销商品、营收概况，输出经营简报
const { callLlm } = require('../../utils/llm');
const { logAgentTask, fetchSalesOrders, fetchSalesSummary } = require('./agentUtils');
const biz = require('../services/shopMemory.business');

// ========== 销售分析系统提示词 ==========
const SYSTEM_PROMPT = `你是一位门店销售数据分析师，擅长从交易数据中挖掘营收增长机会。请输出专业销售经营简报。

【报告模板】

# 门店销售经营简报
> 统计周期：最近 30 天
> 数据来源：真实销售订单

---

## 一、核心经营指标看板
| 指标 | 本月数值 | 环比 | 评价 |
|------|----------|------|------|
| 总营收 | X 元 | 增/减 X% | 健康/下滑 |
| 总成本 | X 元 | - | - |
| 总毛利 | X 元 | - | 健康/下滑 |
| 综合毛利率 | X% | - | 健康/偏低 |
| 订单总数 | X 笔 | - | - |
| 客单价 | X 元 | - | - |
| 人均购买 SKU | X 个 | - | - |

## 二、商品销售排行榜
### 2.1 销量 TOP 5（件数）
### 2.2 营收 TOP 5（金额）
### 2.3 毛利贡献 TOP 5（利润）
### 2.4 滞销 TOP 5（有库存但零销售）

## 三、客户消费画像

## 四、营收增长机会点（3 条）

【约束】所有数据必须来自真实订单 JSON，严禁编造。`;

/**
 * 销售分析 Agent 主函数
 */
async function run(tenantId, userInput, taskId) {
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  console.log('[Sales] 拉取销售数据');
  const summary = await fetchSalesSummary(tenantId);
  const recentOrders = await fetchSalesOrders(tenantId, 20);

  const dataContext = JSON.stringify({
    month_summary: summary,
    recent_orders: recentOrders.map(o => ({
      no: o.order_no, customer: o.customer_name, amount: o.total_amount,
      cost: o.total_cost, profit: o.gross_profit,
      time: o.sales_time || o.create_time, status: o.status,
      items: (o.items || []).map(i => ({
        name: i.product_name, qty: i.quantity, price: i.unit_price, amount: i.amount
      }))
    }))
  }, null, 0);

  console.log('[Sales] 调用 LLM 生成经营简报');
  const result = await callLlm(memoryText + '\n' + SYSTEM_PROMPT,
    `用户请求: ${userInput}\n\n以下是当前门店的真实销售数据（JSON格式）：\n${dataContext}\n\n请基于以上数据生成经营分析简报。`, { tenantId });

  await logAgentTask({
    tenant_id: tenantId, task_id: taskId, agent_name: 'sales',
    input_params: { user_input: userInput, month_sales: summary.month_sales },
    agent_output: result, status: 'success',
  });

  return result;
}

module.exports = { run };

