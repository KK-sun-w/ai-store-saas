// AI Agent 控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const agent = require('../ai/agent');
const config = require('../ai/config');
const biz = require('../services/shopMemory.business');

/**
 * POST /ai/agent/chat
 * 非流式, 一次返回完整回复
 * body: { message: string, history?: [{role, content}] }
 */
exports.chat = asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ code: 400, message: 'message 不能为空' });
  }

  // ★ 记忆注入: 调LLM前, 拼入当前租户的店铺历史记忆
  const tenantId = req.user.tenantId;
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  const systemPrompt = memoryText ? config.systemPrompt + '\n' + memoryText : config.systemPrompt;

  const result = await agent.chat(history, message, req.headers.authorization?.replace('Bearer ', ''), { systemPrompt });

  // ★ 对话后异步提取记忆(不阻塞响应): LLM分析用户是否透露了经营决策/偏好
  setImmediate(async () => {
    try {
      const extracted = await biz.extractMemoryFromChat(tenantId, message, result.reply);
      if (extracted.saved > 0) {
        console.log('[AI Chat] 自动提取' + extracted.saved + '条记忆, tenant=' + tenantId);
      }
    } catch (err) {
      console.error('[AI Chat] 记忆提取失败:', err.message);
    }
  });

  return ok(res, result);
});

/**
 * POST /ai/agent/chatStream
 * 流式 SSE, 逐 token 推前端
 * body: { message: string, history?: [{role, content}] }
 *
 * SSE event data JSON 格式:
 *   { type: "delta", content: "..." }             增量文本
 *   { type: "tool_call", calls: [...] }            LLM 决定调用工具
 *   { type: "tool_result", name, content, error }  工具执行完成
 *   { type: "done", text: "..." }                  本轮结束
 *   { type: "error", message: "..." }              出错
 */
exports.chatStream = asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ code: 400, message: 'message 不能为空' });
  }

  // ★ 记忆注入: 流式对话同样拼入店铺历史记忆
  const tenantId = req.user.tenantId;
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  const systemPrompt = memoryText ? config.systemPrompt + '\n' + memoryText : config.systemPrompt;

  const authToken = req.headers.authorization?.replace('Bearer ', '');
  await agent.chatStream(history, message, authToken, res, { systemPrompt });
  // 不手动 close, 让客户端断开或 done 后自然结束
});
