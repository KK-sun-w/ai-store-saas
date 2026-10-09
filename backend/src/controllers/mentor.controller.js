// 门店商业导师 Agent 控制器
// 复用: callLlm(axios+记忆注入) + agentUtils(数据查询+审计日志) + shopMemory.business(记忆提取)
// 只读Agent: 只查询不修改, 无写库操作
const asyncHandler = require("../utils/asyncHandler");
const { ok } = require("../utils/response");
const { callLlm } = require("../../utils/llm");
const mentorPrompt = require("../ai/prompts/mentor.prompt");
const biz = require("../services/shopMemory.business");
const { logAgentTask, genTaskId, fetchProducts, fetchSalesOrders, fetchSalesSummary, fetchInventoryLogs, fetchPurchaseOrders } = require("../agents/agentUtils");

// 估算token(粗略: 中文1字~1.5 token, 英文1词~1 token)
function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk * 1.5 + other * 0.25);
}

/**
 * 预取店铺经营数据(全部只读查询, 带 tenant_id 隔离)
 */
async function fetchShopData(tenantId) {
  const [products, salesSummary, recentOrders, inventory, purchases] = await Promise.all([
    fetchProducts(tenantId).catch(() => []),
    fetchSalesSummary(tenantId).catch(() => ({})),
    fetchSalesOrders(tenantId, 20).catch(() => []),
    fetchInventoryLogs(tenantId, 20).catch(() => []),
    fetchPurchaseOrders(tenantId, 10).catch(() => []),
  ]);
  return {
    products: (products || []).map(p => ({
      name: p.product_name, sku: p.sku, price: p.selling_price, cost: p.cost_price,
      stock: p.stock_quantity, category: p.category,
    })),
    sales_summary: salesSummary || {},
    recent_orders: (recentOrders || []).map(o => ({
      no: o.order_no, customer: o.customer_name, amount: o.total_amount,
      cost: o.total_cost, profit: o.gross_profit, time: o.sales_time || o.create_time,
      items: (o.items || []).map(i => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
    })),
    inventory_logs: (inventory || []).slice(0, 10).map(l => ({
      product: l.product_name, type: l.change_type, qty: l.change_quantity, time: l.create_time, remark: l.remark,
    })),
    purchases: (purchases || []).map(p => ({
      no: p.purchase_no, supplier: p.supplier_name, amount: p.total_amount, status: p.status, time: p.create_time,
    })),
  };
}

/**
 * POST /mentor/chat
 * 非流式: 预取数据 → 记忆注入 → LLM分析 → 审计日志 → token统计
 */
exports.chat = asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ code: 400, message: "message 不能为空" });
  }

  const tenantId = req.user.tenantId;
  const taskId = genTaskId();

  // ① 预取店铺经营数据(只读)
  const shopData = await fetchShopData(tenantId);
  const dataContext = JSON.stringify(shopData, null, 0);

  // ② 构建用户消息(含真实数据)
  const userContent = `用户请求: ${message}\n\n以下是当前门店的真实经营数据(JSON格式):\n${dataContext}\n\n请基于以上真实数据分析, 给出经营建议。`;

  // ③ 调用LLM(callLlm内部自动注入记忆, 用axios, 已验证可用)
  const t0 = Date.now();
  const reply = await callLlm(mentorPrompt, userContent, { tenantId });
  const elapsedMs = Date.now() - t0;

  // ④ token统计
  const inputTokens = estimateTokens(mentorPrompt + userContent);
  const outputTokens = estimateTokens(reply);
  const totalTokens = inputTokens + outputTokens;

  // ⑤ 审计日志落库
  await logAgentTask({
    tenant_id: tenantId, task_id: taskId, agent_name: "mentor",
    input_params: { user_input: message, data_source_count: shopData.products.length + shopData.recent_orders.length },
    agent_output: reply, status: "success",
  });

  // ⑥ 异步提取记忆(不阻塞响应)
  setImmediate(async () => {
    try {
      const extracted = await biz.extractMemoryFromChat(tenantId, message, reply);
      if (extracted.saved > 0) console.log("[Mentor] 提取" + extracted.saved + "条记忆, tenant=" + tenantId);
    } catch (err) { console.error("[Mentor] 记忆提取失败:", err.message); }
  });

  // ⑦ 返回结果 + 元信息
  return ok(res, {
    reply,
    meta: {
      task_id: taskId,
      elapsed_ms: elapsedMs,
      token_stats: { input: inputTokens, output: outputTokens, total: totalTokens },
      memory_injected: true,
      data_sources: [
        { tool: "products", count: shopData.products.length },
        { tool: "sales_orders", count: shopData.recent_orders.length },
        { tool: "sales_summary", summary: shopData.sales_summary },
        { tool: "inventory_logs", count: shopData.inventory_logs.length },
        { tool: "purchases", count: shopData.purchases.length },
      ],
    },
  });
});

/**
 * POST /mentor/chatStream
 * 流式 SSE: 预取数据 → 记忆注入 → LLM流式输出
 */
exports.chatStream = asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ code: 400, message: "message 不能为空" });
  }

  const tenantId = req.user.tenantId;
  const taskId = genTaskId();

  // 预取数据
  const shopData = await fetchShopData(tenantId);
  const dataContext = JSON.stringify(shopData, null, 0);
  const userContent = `用户请求: ${message}\n\n以下是当前门店的真实经营数据(JSON格式):\n${dataContext}\n\n请基于以上真实数据给出经营建议。`;

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    // callLlm 不支持流式, 用非流式 + 模拟分段返回
    const t0 = Date.now();
    const reply = await callLlm(mentorPrompt, userContent, { tenantId });
    const elapsedMs = Date.now() - t0;

    // 分段推送(每200字一段, 模拟流式体验)
    const chunkSize = 200;
    for (let i = 0; i < reply.length; i += chunkSize) {
      send({ type: "delta", content: reply.slice(i, i + chunkSize) });
    }

    // 元信息
    const inputTokens = estimateTokens(mentorPrompt + userContent);
    const outputTokens = estimateTokens(reply);
    send({
      type: "done",
      text: reply,
      meta: {
        task_id: taskId,
        elapsed_ms: elapsedMs,
        token_stats: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
        memory_injected: true,
        data_sources: [{ tool: "products", count: shopData.products.length }],
      },
    });

    // 审计 + 记忆提取
    await logAgentTask({
      tenant_id: tenantId, task_id: taskId, agent_name: "mentor",
      input_params: { user_input: message, stream: true },
      agent_output: reply, status: "success",
    });
    setImmediate(async () => {
      try { await biz.extractMemoryFromChat(tenantId, message, reply); } catch {}
    });
  } catch (err) {
    console.error("[Mentor] stream error:", err.message);
    send({ type: "error", message: err.message });
  }
});
