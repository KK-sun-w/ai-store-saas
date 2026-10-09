// Agent 工具调用审计服务
// 记录每次工具调用的输入/输出/状态/耗时/权限校验结果
// setImmediate 异步写库, 不阻塞 Agent 主流程
const { query } = require('../config/db');
const { logger } = require('../utils/logger');

/**
 * 异步记录工具调用审计(不阻塞主流程)
 * @param {object} p
 * @param {number} p.tenantId 租户ID
 * @param {string} p.taskId Agent任务ID
 * @param {string} p.toolName 工具名
 * @param {object|string} p.inputArgs 输入参数
 * @param {object|string} p.outputResult 输出结果
 * @param {string} p.status success/failed/blocked
 * @param {number} p.durationMs 耗时毫秒
 * @param {string} p.errorMsg 错误信息
 */
function logToolCall({ tenantId, taskId, toolName, inputArgs, outputResult, status = 'success', durationMs = null, errorMsg = null }) {
  setImmediate(async () => {
    try {
      const inputStr = typeof inputArgs === 'string' ? inputArgs : JSON.stringify(inputArgs || {});
      const outputStr = typeof outputResult === 'string'
        ? outputResult
        : JSON.stringify(outputResult || '');
      // 截断防止 TEXT 字段过长
      await query(
        `INSERT INTO ai_tool_call_log
           (tenant_id, task_id, tool_name, input_args, output_result, status, duration_ms, error_msg)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          tenantId, taskId, toolName,
          inputStr.slice(0, 8000),
          outputStr.slice(0, 8000),
          status, durationMs, errorMsg ? String(errorMsg).slice(0, 500) : null,
        ]
      );
    } catch (e) {
      // 审计日志写失败不得影响 Agent
      logger.error('[toolAudit] 写入失败', e.message);
    }
  });
}

module.exports = { logToolCall };
