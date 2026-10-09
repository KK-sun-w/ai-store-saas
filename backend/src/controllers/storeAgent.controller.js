// 门店综合业务 Agent 控制器
// 统一入口: 合并库存分析/商品运营/销售报表/采购建议/门店商业导师
// 工具调用由 LLM 自主决定, tenant_id 通过 JWT 注入内部 API 实现多租户隔离
// 企业级加固: ctx 透传 tenantId/taskId/role; 对话结束异步写记忆
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const AppError = require('../utils/appError');
const agent = require('../ai/agent');
const config = require('../ai/config');
const biz = require('../services/shopMemory.business');
const { logAgentTask, genTaskId } = require('../agents/agentUtils');
const { logger } = require('../utils/logger');

/**
 * POST /ai/agent/store-business
 * 非流式: 用户输入自然语言业务需求 -> Agent 自主调用工具 -> 返回分析结果
 * body: { input: string, history?: [{role, content}] }
 */
exports.run = asyncHandler(async (req, res) => {
  const { input, history = [] } = req.body;
  if (!input || typeof input !== 'string' || !input.trim()) {
    throw new AppError(400, 400, '请输入业务需求');
  }

  const tenantId = req.user.tenantId;
  const userId = req.user.userId;
  const role = req.user.role;
  const taskId = genTaskId();
  const authToken = req.headers.authorization?.replace('Bearer ', '');

  // ---------- 1. 注入店铺记忆 (只读) ----------
  let memoryText = '';
  try {
    memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  } catch (memErr) {
    // 记忆查询失败不阻断主流程, 降级无记忆运行
    logger.warn('[StoreAgent] 店铺记忆查询失败:', memErr.message);
  }

  const systemPrompt = memoryText
    ? config.systemPrompt + '\n' + memoryText
    : config.systemPrompt;

  // ---------- 2. 执行 Agent (LLM + 工具调用闭环 + ctx透传) ----------
  let result;
  try {
    result = await agent.chat(history, input, authToken, {
      systemPrompt, shopId: tenantId,
      // ctx 透传: 供 tools.js runTool 做权限校验 + 审计日志
      tenantId, taskId, role, userId,
    });
  } catch (agentErr) {
    // Agent 执行失败: LLM 超时 / 工具调用异常 / 网络错误
    logger.error('[StoreAgent] Agent 执行失败:', agentErr.message);

    // 写失败审计日志
    try {
      await logAgentTask({
        tenant_id: tenantId,
        task_id: taskId,
        user_id: userId,
        agent_name: 'store_business',
        input_params: { user_input: input },
        agent_output: { error: agentErr.message },
        status: 'failed',
      });
    } catch (_) { /* 日志失败不影响响应 */ }

    throw new AppError(500, 500, `Agent 执行失败: ${agentErr.message || '未知错误'}。请稍后重试或简化您的问题。`);
  }

  const reply = result.reply || '';

  // ---------- 3. 空结果兜底 ----------
  if (!reply.trim()) {
    return ok(res, {
      result: '抱歉, Agent 未能生成有效结果。请尝试更具体的业务问题,例如:\n- "分析当前库存状态,找出滞销商品"\n- "查看本月销售情况并给出经营建议"\n- "生成一份采购建议清单"',
      task_id: taskId,
    });
  }

  // ---------- 4. 成功审计日志 ----------
  try {
    await logAgentTask({
      tenant_id: tenantId,
      task_id: taskId,
      user_id: userId,
      agent_name: 'store_business',
      input_params: { user_input: input },
      agent_output: reply,
      status: 'success',
    });
  } catch (_) { /* 日志失败不影响响应 */ }

  // ---------- 5. 异步写入店铺记忆 (不阻塞响应) ----------
  // 提炼本次对话中的用户决策/偏好, 写入 tenant_shop_memory
  setImmediate(async () => {
    try {
      await biz.extractMemoryFromChat(tenantId, input, reply);
      logger.info(`[StoreAgent] 记忆写入完成, tenant=${tenantId}, task=${taskId}`);
    } catch (memErr) {
      // 记忆写入失败不得影响已返回的响应
      logger.error('[StoreAgent] 记忆写入失败:', memErr.message);
    }
  });

  return ok(res, { result: reply, task_id: taskId });
});
