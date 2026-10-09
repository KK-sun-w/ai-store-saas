// DeepSeek LLM 调用封装
// 安全约束: API Key 只从环境变量读取,禁止硬编码
// 企业级加固: 调用经过熔断器 + 指数退避重试, 第三方 API 报错自动入库
// Token 配额: 调用前 checkAgentTokenQuota, 成功后 deductAgentToken(按usage), 失败不扣
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { breaker } = require('../src/utils/circuitBreaker');
const { withRetry } = require('../src/utils/llmRetry');
const { logger } = require('../src/utils/logger');
const { checkAgentTokenQuota, deductAgentToken } = require('../src/utils/tokenQuota');

// ==========DeepSeek 配置(全部从环境变量读取)==========
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const TEXT_MODEL = process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-chat';
const VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL || 'deepseek-v4-flash-vision-exp';

// 启动时校验, 缺失 Key 仅告警, 禁止降级用硬编码
if (!API_KEY) {
  logger.error('[llm] 未配置 DEEPSEEK_API_KEY 环境变量, AI 调用将失败');
}
// =================================

// 店铺记忆注入(延迟加载, 避免循环依赖)
let _getMemory = null;
async function injectMemory(tenantId, systemPrompt) {
  if (!tenantId) return systemPrompt;
  try {
    if (!_getMemory) {
      _getMemory = require('../src/services/shopMemory.business').getMemoryForPrompt;
    }
    const memoryText = await _getMemory(tenantId, 8);
    if (memoryText) return systemPrompt + "\n" + memoryText;
  } catch (e) {
    logger.error('[llm] 记忆注入失败, 降级为无记忆:', e.message);
  }
  return systemPrompt;
}

function buildHeaders() {
  if (!API_KEY) throw new Error('AI 服务未配置 API Key');
  return {
    "Authorization": "Bearer " + API_KEY,
    "Content-Type": "application/json"
  };
}

/**
 * 统一的 LLM 调用 + Token 配额处理
 * 流程: ① 调用前 checkAgentTokenQuota(配额不足直接抛403, 不发请求)
 *       ② 发起 API 请求(熔断器+重试包装)
 *       ③ 成功拿到 usage 后 deductAgentToken(写流水+原子递增)
 *       ④ 失败/熔断/超时: 不扣Token(无实际消耗不计费)
 * @param {object} body 请求体
 * @param {object} opts { tenantId, userId, scene, remark, timeout }
 * @returns {Promise<{content: string, usage: object}>}
 */
async function callLlmWithQuota(body, opts = {}) {
  const { tenantId, userId, scene = 'llm', remark = '', timeout = 60000 } = opts;

  // ① 调用前校验配额(不足直接拦截, 避免浪费钱)
  if (tenantId) {
    await checkAgentTokenQuota(tenantId);
  }

  let res;
  try {
    res = await breaker.exec(() => withRetry(async () => {
      return axios.post(API_URL, body, { headers: buildHeaders(), timeout });
    }));
  } catch (e) {
    // ② 失败/熔断/超时/网络异常: 不扣Token
    logger.error('[llm] 调用失败(不扣Token):', e.message);
    throw e;
  }

  // ③ 成功: 提取 usage 并扣减
  const usage = res.data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  if (tenantId && (usage.prompt_tokens || usage.completion_tokens)) {
    // 异步扣减, 不阻塞响应返回(但要等确保成功才返回, 避免计费丢失)
    try {
      await deductAgentToken(tenantId, userId, usage.prompt_tokens, usage.completion_tokens, scene, remark);
    } catch (deductErr) {
      // 扣减失败只记录日志, 不影响已拿到的模型回复
      logger.error('[llm] Token扣减失败:', deductErr.message);
    }
  }

  return {
    content: res.data.choices[0].message.content,
    usage,
  };
}

/**
 * 文本模型调用
 * 经过 熔断器 + 指数退避重试 + Token配额校验/扣减
 * @param {string} systemPrompt 系统提示词
 * @param {string} userContent 用户文本
 * @param {object} opts { tenantId, userId, scene, remark }
 * @returns {Promise<string>} 模型回复文本
 */
exports.callLlm = async (systemPrompt, userContent, opts = {}) => {
  const finalPrompt = opts.tenantId ? await injectMemory(opts.tenantId, systemPrompt) : systemPrompt;
  const body = {
    model: TEXT_MODEL,
    messages: [
      { role: "system", content: finalPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.7
  };
  const result = await callLlmWithQuota(body, { ...opts, timeout: 60000 });
  return result.content;
};

/**
 * 把本地图片文件读取为 base64 data URL
 * DeepSeek 视觉模型支持 data: 内联图片，本地图片无需公网可访问
 */
function fileToDataUrl(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const mime = mimeMap[ext] || 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    logger.error('[llm] fileToDataUrl error:', e.message);
    return null;
  }
}

/**
 * 多模态视觉模型调用（有图片时使用，真正"看图"识别）
 * 同样经过熔断器 + 重试 + Token配额
 */
exports.callLlmWithImages = async (systemPrompt, userContent, imageDataUrls, opts = {}) => {
  const finalPrompt = opts.tenantId ? await injectMemory(opts.tenantId, systemPrompt) : systemPrompt;
  const content = [{ type: 'text', text: userContent }];
  for (const url of (imageDataUrls || [])) {
    if (!url) continue;
    content.push({ type: 'image_url', image_url: { url } });
  }
  const body = {
    model: VISION_MODEL,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: finalPrompt }] : []),
      { role: 'user', content }
    ],
    temperature: 0.7
  };
  const result = await callLlmWithQuota(body, { ...opts, timeout: 120000 });
  return result.content;
};

/**
 * 自动选择调用入口
 * - imageDataUrls 非空 -> 多模态 VL 模型
 * - imageDataUrls 为空 -> 文本模型
 */
exports.callLlmAuto = async (systemPrompt, userContent, imageDataUrls, opts = {}) => {
  if (imageDataUrls && imageDataUrls.length > 0) {
    return exports.callLlmWithImages(systemPrompt, userContent, imageDataUrls, opts);
  }
  return exports.callLlm(systemPrompt, userContent, opts);
};

exports.fileToDataUrl = fileToDataUrl;
