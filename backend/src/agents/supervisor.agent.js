// 🧠 Supervisor 总控调度 Agent
// 职责：解析用户意图，调度专业 Agent，汇总结果
// 不做具体业务，只做任务分发、流程控制、结果聚合
const { callLlm } = require('../../utils/llm');
const { logAgentTask } = require('./agentUtils');

// ========== Supervisor 系统提示词 ==========
const SYSTEM_PROMPT = `你是门店进销存SaaS系统的总控调度Agent（Supervisor）。
你的职责是：分析用户的自然语言请求，判断需要调度哪些专业Agent来完成任务。

可调度的专业Agent列表：
1. marketing - 短视频营销Agent：生成抖音短视频口播文案、引流脚本
2. inventory - 库存经营Agent：分析库存状态、滞销商品、低库存预警、补货建议
3. product - 商品运营Agent：生成商品卖点、描述、上架文案、定价建议
4. sales - 销售分析Agent：分析销售数据、热销商品、营收概况、经营简报
5. procurement - 采购建议Agent：结合库存+历史销量，生成采购清单草稿

请分析用户请求，严格返回以下JSON格式（不要包含markdown代码块标记，不要多余文字）：
{
  "agents": ["需要调用的agent名称数组"],
  "task_summary": "任务摘要描述",
  "sub_tasks": {
    "agent_name": "该agent需要完成的具体子任务描述"
  }
}

调度规则：
- agent名称必须是上述5个之一
- 如果用户请求不明确，尽量选择最相关的agent
- 一个请求可能需要多个agent协同（例如"分析库存并给滞销品写文案"需要inventory+marketing）
- 如果用户只是闲聊或问通用问题，返回空agents数组
- 只返回JSON，不要任何其他文字`;

/**
 * Supervisor Agent：解析意图 + 调度 + 汇总
 * @param {number} tenantId  租户ID
 * @param {string} userQuery 用户自然语言请求
 * @param {string} taskId    任务ID
 * @param {function} agentRunner  专业Agent执行器（注入依赖，方便测试）
 * @returns {Promise<object>} { result, agent_trace }
 */
async function run(tenantId, userQuery, taskId, agentRunner) {
  // Step 1: 调用 LLM 解析意图
  console.log('[Supervisor] 开始解析用户意图:', userQuery);

  const llmResponse = await callLlm(SYSTEM_PROMPT, userQuery, { tenantId });

  // 解析 JSON（容错：去掉可能的 markdown 代码块标记）
  let plan;
  try {
    const cleaned = llmResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    plan = JSON.parse(cleaned);
  } catch (e) {
    // LLM 返回的不是合法 JSON，降级为通用回复
    console.warn('[Supervisor] LLM 返回非JSON，降级处理:', llmResponse.substring(0, 200));
    await logAgentTask({
      tenant_id: tenantId, task_id: taskId, agent_name: 'supervisor',
      input_params: { user_query: userQuery },
      agent_output: { error: 'LLM返回非JSON', raw: llmResponse },
      status: 'failed',
    });
    return {
      result: '抱歉，我暂时无法理解您的请求。请尝试更明确地描述您需要什么帮助，例如：\n- "帮我分析库存情况"\n- "给五金工具写一条抖音短视频文案"\n- "生成本月销售简报"',
      agent_trace: [{ agent: 'supervisor', status: 'failed', error: 'LLM返回非JSON' }],
    };
  }

  const agentsToCall = plan.agents || [];
  const subTasks = plan.sub_tasks || {};
  const trace = [];

  // Step 2: 如果没有需要调度的 Agent，直接返回 task_summary
  if (agentsToCall.length === 0) {
    const result = plan.task_summary || '我理解了您的请求，但暂时没有匹配的专业Agent来处理。请尝试以下操作：分析库存、生成文案、查看销售报表等。';
    await logAgentTask({
      tenant_id: tenantId, task_id: taskId, agent_name: 'supervisor',
      input_params: { user_query: userQuery, plan },
      agent_output: { result },
      status: 'success',
    });
    return { result, agent_trace: [{ agent: 'supervisor', status: 'success', note: 'no sub-agents needed' }] };
  }

  // Step 3: 依次调用专业 Agent
  const agentOutputs = [];
  for (const agentName of agentsToCall) {
    const subTaskDesc = subTasks[agentName] || userQuery;
    console.log(`[Supervisor] 调度 Agent: ${agentName}, 子任务: ${subTaskDesc.substring(0, 100)}`);

    try {
      const output = await agentRunner(agentName, tenantId, subTaskDesc, taskId);
      agentOutputs.push({ agent: agentName, status: 'success', result: output });
      trace.push({ agent: agentName, status: 'success', summary: String(output).substring(0, 200) });
    } catch (e) {
      console.error(`[Supervisor] Agent ${agentName} 执行失败:`, e.message);
      agentOutputs.push({ agent: agentName, status: 'failed', error: e.message });
      trace.push({ agent: agentName, status: 'failed', error: e.message });
    }
  }

  // Step 4: 汇总所有 Agent 输出
  let finalResult;
  if (agentOutputs.length === 1 && agentOutputs[0].status === 'success') {
    // 单 Agent 成功，直接返回其输出
    finalResult = agentOutputs[0].result;
  } else {
    // 多 Agent 或有失败，用 LLM 汇总
    const summaryPrompt = '请将以下各专业Agent的输出汇总成一段连贯的回复给用户。保持内容完整，按Agent分组排版：\n\n';
    const outputsText = agentOutputs.map((o) => 
      `【${o.agent}】${o.status === 'success' ? o.result : '执行失败: ' + o.error}`
    ).join('\n\n');
    finalResult = await callLlm(
      '你是门店进销存系统的总控Agent，负责将多个专业Agent的输出汇总成一段给用户的完整回复。保持格式清晰，用markdown排版。',
      summaryPrompt + outputsText, { tenantId });
  }

  await logAgentTask({
    tenant_id: tenantId, task_id: taskId, agent_name: 'supervisor',
    input_params: { user_query: userQuery, plan },
    agent_output: { result: finalResult, agent_count: agentsToCall.length },
    status: 'success',
  });

  return { result: finalResult, agent_trace: trace };
}

module.exports = { run };
