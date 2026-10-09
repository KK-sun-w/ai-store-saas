// ================================================================
// 记忆增强对话 Controller
// 包装现有 AI Agent, 在对话前后增加记忆读写:
//   1. 调用前: 查高权重记忆 → 拼入system prompt头部
//   2. 调用现有 agent.chat() 做推理
//   3. 调用后: LLM提取用户决策/偏好 → 写入长期记忆
//   4. 原始对话归档到 ai_chat_log_archive(不参与推理)
// 不修改 ai.controller.js / agent.js, 纯新增包装层
// ================================================================
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const agent = require('../ai/agent');
const config = require('../ai/config');
const biz = require('../services/shopMemory.business');
const crypto = require('crypto');

// 生成会话ID(用日期+随机串, 不依赖外部传入)
function genSessionId() {
  return 'sess_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

/**
 * POST /api/shop-memory/chat
 * 记忆增强对话(非流式)
 * body: { message: string, history?: [{role, content}], session_id?: string }
 *
 * 完整流程:
 *   1. 查当前租户高权重记忆 → 拼到system prompt
 *   2. 调 agent.chat() 做AI推理
 *   3. 异步: LLM提取记忆 + 原始聊天归档(不阻塞响应)
 */
exports.chat = asyncHandler(async (req, res) => {
  const { message, history = [], session_id } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ code: 400, message: 'message 不能为空' });
  }

  const tenantId = req.user.tenantId;   // 从JWT获取, 不接受前端传参
  const sessionId = session_id || genSessionId();
  const authToken = req.headers.authorization?.replace('Bearer ', '');

  // 1. 查高权重记忆, 拼到system prompt头部
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  const enhancedPrompt = memoryText
    ? config.systemPrompt + '\n' + memoryText
    : config.systemPrompt;

  // 2. 调用现有agent做推理(注入了记忆的prompt)
  const result = await agent.chat(history, message, authToken, { systemPrompt: enhancedPrompt });
  const aiReply = result.reply || '';

  // 3. 异步: 提取记忆 + 归档聊天(不阻塞响应, 用户不需要等)
  // 用 setImmediate 让响应先返回, 后台再跑LLM提取
  setImmediate(async () => {
    try {
      // 归档原始对话(仅审计, 不参与推理)
      await biz.archiveChatLog(tenantId, sessionId, 'user', message, { model: config.llm.model });
      await biz.archiveChatLog(tenantId, sessionId, 'assistant', aiReply, { model: config.llm.model });

      // LLM提取用户决策/偏好 → 写入长期记忆
      const extracted = await biz.extractMemoryFromChat(tenantId, message, aiReply);
      if (extracted.saved > 0) {
        console.log(`[ShopMemory] 从对话提取${extracted.saved}条记忆, tenant=${tenantId}, session=${sessionId}`);
      }
    } catch (err) {
      console.error('[ShopMemory] 后台记忆处理失败:', err.message);
    }
  });

  // 响应里附带session_id, 前端可传回续聊
  return ok(res, { ...result, session_id: sessionId });
});

/**
 * POST /api/shop-memory/business-record
 * 进销存业务完成后手动触发记忆写入
 * 前端在销售/进货完成后调用此接口, 系统自动记录结构化摘要
 * body: { biz_type, order_id, summary, amount, item_count, items }
 */
exports.recordBusiness = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;  // 从JWT获取
  const data = req.body;
  const result = await biz.recordBusinessData(tenantId, data);
  return ok(res, result, '业务记忆已记录');
});

/**
 * POST /api/shop-memory/extract
 * 手动触发记忆提取(通常由系统自动调用, 也开放给前端调试)
 * body: { user_message, ai_reply }
 */
exports.extract = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { user_message, ai_reply } = req.body;
  const result = await biz.extractMemoryFromChat(tenantId, user_message, ai_reply);
  return ok(res, result, `提取${result.saved}条记忆`);
});

/**
 * POST /api/shop-memory/archive-chat
 * 手动归档原始聊天(通常由系统自动调用)
 * body: { session_id, role, content, meta }
 */
exports.archiveChat = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { session_id, role, content, meta } = req.body;
  const result = await biz.archiveChatLog(tenantId, session_id, role, content, meta);
  return ok(res, result, '已归档');
});

/**
 * GET /api/shop-memory/inject
 * 获取记忆prompt文本(供调试查看, 展示注入后prompt长什么样)
 */
exports.inject = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const limit = req.query.limit || 8;
  const memoryText = await biz.getMemoryForPrompt(tenantId, limit);
  return ok(res, { memory_text: memoryText, prompt_preview: memoryText ? '已注入记忆' : '无记忆' });
});
