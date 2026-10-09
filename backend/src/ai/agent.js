// AI Agent 主循环
// 非流式 (chat) + 流式 SSE (chatStream)
// 企业级加固: ctx 透传 tenantId/taskId/role 供审计; chat 末尾增加反思环节
// Token配额: ReAct每轮LLM调用前 checkAgentTokenQuota, 成功后 deductAgentToken(按usage);
//            配额不足直接终止Agent执行, 返回友好提示
const OpenAI = require('openai');
const config = require('./config');
const { getToolsForLLM, runTool } = require('./tools');
const { callLlm } = require('../../utils/llm');
const { logger } = require('../utils/logger');
const { checkAgentTokenQuota, deductAgentToken } = require('../utils/tokenQuota');

// 单例 LLM Client
let llmClient = null;
function getLLM() {
  if (!llmClient) {
    llmClient = new OpenAI({
      baseURL: config.llm.baseURL,
      apiKey: config.llm.apiKey || 'dummy',
    });
  }
  return llmClient;
}

// 把 shop_id 注入到 system prompt
function injectShopId(systemPrompt, shopId) {
  const base = systemPrompt || config.systemPrompt;
  if (!shopId) return base;
  return base + '\n\n# 当前登录店铺\n当前 shop_id = ' + shopId + '，所有工具调用必须使用此 shop_id。';
}

// 把 conversation history + system prompt 组合成 messages
function buildMessages(conversationHistory, systemPrompt) {
  const messages = [{ role: 'system', content: systemPrompt }];
  const trimmed = conversationHistory.slice(-config.maxConversationHistory * 2);
  for (const m of trimmed) {
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'tool') {
      if (m.role === 'tool') {
        messages.push({ role: 'tool', tool_call_id: m.tool_call_id, content: String(m.content ?? '') });
      } else if (m.role === 'assistant' && m.tool_calls) {
        messages.push({ role: 'assistant', content: m.content || '', tool_calls: m.tool_calls });
      } else {
        messages.push({ role: m.role, content: String(m.content ?? '') });
      }
    }
  }
  return messages;
}

/**
 * 扣减一轮 LLM 调用的 Token(从 OpenAI 响应中提取 usage)
 * 失败/无 usage 时不扣减
 */
async function deductFromUsage(usage, ctx, scene) {
  if (!usage || !ctx.tenantId) return;
  try {
    await deductAgentToken(
      ctx.tenantId, ctx.userId,
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      scene, ''
    );
  } catch (e) {
    logger.error('[agent] Token扣减失败:', e.message);
  }
}

/**
 * 反思环节: 用 LLM 审视最终回复质量
 * 合格(PASS)直接返回原文; 有问题追加改进建议
 * 注: callLlm 内部已处理配额校验+扣减(scene=reflection)
 */
async function reflectOnReply(userMessage, reply, ctx) {
  if (!config.enableReflection) return reply;
  try {
    const prompt = `${config.reflectionPrompt}\n\n【用户诉求】${userMessage}\n\n【Agent回复】${reply}`;
    const r = await callLlm('', prompt, { tenantId: ctx.tenantId, userId: ctx.userId, scene: 'reflection' });
    if (r && r.trim().startsWith('PASS')) return reply;
    if (r && r.trim()) {
      return reply + '\n\n---\n💡 质检补充：' + r.trim();
    }
    return reply;
  } catch (e) {
    logger.warn('[agent] 反思环节失败, 跳过:', e.message);
    return reply;
  }
}

// 非流式: 单轮完整回复
async function chat(conversationHistory, userMessage, authToken, opts = {}) {
  const llm = getLLM();
  // ctx 透传 tenantId/taskId/role/userId 供工具审计 + Token扣减
  const ctx = {
    authToken,
    shopId: opts.shopId,
    tenantId: opts.tenantId,
    taskId: opts.taskId,
    role: opts.role,
    userId: opts.userId,
  };

  const sp = injectShopId(opts.systemPrompt, opts.shopId);
  const messages = buildMessages(conversationHistory, sp);
  messages.push({ role: 'user', content: userMessage });

  const tools = getToolsForLLM();
  let assistantContent = '';
  const finalMessages = [...messages];
  let quotaExhausted = false;

  for (let i = 0; i < config.maxIterations; i++) {
    // ---- Token配额校验(每一轮LLM调用前) ----
    try {
      if (ctx.tenantId) await checkAgentTokenQuota(ctx.tenantId);
    } catch (quotaErr) {
      // 配额耗尽: 立刻终止, 返回友好提示
      quotaExhausted = true;
      logger.warn('[agent] Agent Token配额耗尽, 终止执行');
      break;
    }

    let resp;
    try {
      resp = await llm.chat.completions.create({
        model: config.llm.model,
        messages: finalMessages,
        tools: tools.length ? tools : undefined,
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxTokens,
        stream: false,
      });
    } catch (llmErr) {
      // LLM调用失败(网络/超时/熔断): 不扣Token, 抛出让上层处理
      throw llmErr;
    }

    // ---- 成功拿到usage, 扣减Token ----
    await deductFromUsage(resp.usage, ctx, 'store_business');

    const choice = resp.choices[0].message;

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      finalMessages.push({ role: 'assistant', content: choice.content || '', tool_calls: choice.tool_calls });
      for (const tc of choice.tool_calls) {
        let toolResult = '';
        try {
          const argsObj = JSON.parse(tc.function.arguments || '{}');
          toolResult = await runTool(tc.function.name, argsObj, ctx);
        } catch (err) {
          toolResult = '[tool error] ' + err.message;
        }
        finalMessages.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult).slice(0, 8000) });
      }
      continue;
    }

    assistantContent = choice.content || '';
    break;
  }

  // 配额耗尽: 返回提示, 不做反思(避免再消耗Token)
  if (quotaExhausted) {
    return {
      reply: '⚠️ Agent Token 配额已耗尽，请前往【AI配额】页面购买套餐后再使用。',
      messages: finalMessages.slice(messages.length),
      quotaExhausted: true,
    };
  }

  // 反思环节(非流式才做, 流式已 send done)
  assistantContent = await reflectOnReply(userMessage, assistantContent, ctx);

  return { reply: assistantContent, messages: finalMessages.slice(messages.length) };
}

// 流式: SSE
async function chatStream(conversationHistory, userMessage, authToken, res, opts = {}) {
  const llm = getLLM();
  const ctx = {
    authToken,
    shopId: opts.shopId,
    tenantId: opts.tenantId,
    taskId: opts.taskId,
    role: opts.role,
    userId: opts.userId,
  };

  const sp = injectShopId(opts.systemPrompt, opts.shopId);
  const messages = buildMessages(conversationHistory, sp);
  messages.push({ role: 'user', content: userMessage });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (obj) => { res.write('data: ' + JSON.stringify(obj) + '\n\n'); };

  let pendingToolCalls = null;
  let assistantFullText = '';

  try {
    let finalMessages = [...messages];
    const tools = getToolsForLLM();

    for (let iteration = 0; iteration < config.maxIterations; iteration++) {
      // ---- Token配额校验(每一轮) ----
      try {
        if (ctx.tenantId) await checkAgentTokenQuota(ctx.tenantId);
      } catch (quotaErr) {
        send({ type: 'error', message: 'Agent Token 配额已耗尽,请购买套餐' });
        return;
      }

      pendingToolCalls = null;
      assistantFullText = '';
      let usage = null;

      const stream = await llm.chat.completions.create({
        model: config.llm.model,
        messages: finalMessages,
        tools: tools.length ? tools : undefined,
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        // 流式模式下 usage 在最后一个 chunk 返回
        if (chunk.usage) usage = chunk.usage;
        const delta = chunk.choices[0].delta;
        if (delta.content) {
          assistantFullText += delta.content;
          send({ type: 'delta', content: delta.content });
        }
        if (delta.tool_calls && delta.tool_calls.length > 0) {
          if (!pendingToolCalls) pendingToolCalls = [];
          for (const dtc of delta.tool_calls) {
            if (dtc.index !== undefined && !pendingToolCalls[dtc.index]) {
              pendingToolCalls[dtc.index] = { id: '', function: { name: '', arguments: '' } };
            }
            const p = pendingToolCalls[dtc.index];
            if (!p) continue;
            if (dtc.id) p.id += dtc.id;
            if (dtc.function) {
              if (dtc.function.name) p.function.name += dtc.function.name;
              if (dtc.function.arguments) p.function.arguments += dtc.function.arguments;
            }
          }
        }
      }

      // ---- 成功: 扣减Token ----
      await deductFromUsage(usage, ctx, 'store_business');

      const validToolCalls = (pendingToolCalls || []).filter((p) => p && p.id);

      if (validToolCalls.length === 0) {
        send({ type: 'done', text: assistantFullText });
        return;
      }

      send({ type: 'tool_call', calls: validToolCalls.map((c) => ({ name: c.function.name, args: c.function.arguments })) });

      finalMessages.push({
        role: 'assistant', content: assistantFullText,
        tool_calls: validToolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.function.name, arguments: c.function.arguments } })),
      });

      for (const tc of validToolCalls) {
        let toolResult = '';
        let toolError = false;
        try {
          const argsObj = JSON.parse(tc.function.arguments || '{}');
          toolResult = await runTool(tc.function.name, argsObj, ctx);
        } catch (err) {
          toolResult = '[tool error] ' + err.message;
          toolError = true;
        }
        send({ type: 'tool_result', name: tc.function.name, content: String(toolResult).slice(0, 8000), error: toolError });
        finalMessages.push({ role: 'tool', tool_call_id: tc.id, content: String(toolResult).slice(0, 8000) });
      }
    }

    send({ type: 'done', text: assistantFullText + '\n\n(Agent 超过最大迭代次数)' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }
}

module.exports = { chat, chatStream, reflectOnReply };
