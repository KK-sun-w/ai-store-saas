// 📝 短视频营销 Agent
// 职责：根据商品/门店信息，生成抖音短视频口播文案、引流脚本
// 内部包含4个子Agent：需求解析 → 构思 → 润色 → 校验
const { callLlm } = require('../../utils/llm');
const { logAgentTask, fetchProducts } = require('./agentUtils');
const biz = require('../services/shopMemory.business');

// ========== 子Agent 1: 需求解析 ==========
const PROMPT_PARSE = `你是短视频营销需求解析Agent。
从用户的自然语言请求中提取关键信息：
- 目标商品名称（如有）
- 视频风格（口播/情景/产品展示）
- 目标平台（抖音/快手/视频号）
- 目标受众
- 特殊要求（促销/引流/品牌宣传）

返回结构化JSON格式（不要markdown标记）：
{ "product": "", "style": "", "platform": "", "audience": "", "special": "" }`;

// ========== 子Agent 2: 构思 ==========
const PROMPT_IDEA = `你是短视频文案构思Agent。
根据需求解析结果和商品信息，生成3个不同的视频开头方案（前3秒黄金钩子）。
每个方案包含：钩子文案、拍摄建议、预期效果。
用中文输出，格式清晰。`;

// ========== 子Agent 3: 润色 ==========
const PROMPT_POLISH = `你是短视频文案润色Agent。
将构思的文案润色成完整的口播脚本，要求：
1. 口语化，适合口播，每句不超过15字
2. 有节奏感，适合快节奏短视频
3. 结尾有明确的引导（点赞/关注/进店）
4. 总时长控制在30-60秒（约100-200字）
直接输出润色后的完整脚本，不要解释。`;

// ========== 子Agent 4: 校验 ==========
const PROMPT_CHECK = `你是短视频文案校验Agent。
检查文案是否符合以下规则：
1. 无违禁词和敏感内容
2. 节奏紧凑，无冗余
3. 有明确的引导行动
4. 字数在100-200字之间
如果通过，返回"校验通过"+最终文案。如果不通过，指出问题并返回修改建议。`;

/**
 * 短视频营销 Agent 主函数
 * @param {number} tenantId  租户ID
 * @param {string} userInput 用户请求
 * @param {string} taskId    任务ID
 */
async function run(tenantId, userInput, taskId) {
  const memoryText = await biz.getMemoryForPrompt(tenantId, 8);
  // 拉取商品信息作为上下文
  const products = await fetchProducts(tenantId);
  const productSummary = products.slice(0, 10).map(p => 
    `${p.name}(SKU:${p.sku_code}, 售价¥${p.sale_price}, 库存${p.current_stock})`
  ).join('; ');

  // 子Agent 1: 需求解析
  console.log('[Marketing] 子Agent 1: 需求解析');
  const parseResult = await callLlm(PROMPT_PARSE,
    `用户请求: ${userInput}\n门店商品列表: ${productSummary}`, { tenantId });

  await logAgentTask({ tenant_id: tenantId, task_id: taskId, agent_name: 'marketing.parse',
    input_params: { user_input: userInput }, agent_output: parseResult, status: 'success' });

  // 子Agent 2: 构思
  console.log('[Marketing] 子Agent 2: 构思');
  const ideaResult = await callLlm(PROMPT_IDEA,
    `需求解析: ${parseResult}\n商品信息: ${productSummary}`, { tenantId });

  await logAgentTask({ tenant_id: tenantId, task_id: taskId, agent_name: 'marketing.idea',
    input_params: { parse_result: parseResult }, agent_output: ideaResult, status: 'success' });

  // 子Agent 3: 润色
  console.log('[Marketing] 子Agent 3: 润色');
  const polishResult = await callLlm(PROMPT_POLISH,
    `构思方案: ${ideaResult}\n商品信息: ${productSummary}`, { tenantId });

  await logAgentTask({ tenant_id: tenantId, task_id: taskId, agent_name: 'marketing.polish',
    input_params: { idea_result: ideaResult }, agent_output: polishResult, status: 'success' });

  // 子Agent 4: 校验
  console.log('[Marketing] 子Agent 4: 校验');
  const checkResult = await callLlm(PROMPT_CHECK, polishResult, { tenantId });

  await logAgentTask({ tenant_id: tenantId, task_id: taskId, agent_name: 'marketing.check',
    input_params: { polish_result: polishResult }, agent_output: checkResult, status: 'success' });

  return checkResult;
}

module.exports = { run };

