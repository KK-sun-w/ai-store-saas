// ================================================================
// 店铺长期记忆 —— 业务读写逻辑层
// 职责: 进销存数据自动写入 / LLM提取用户决策 / 记忆注入prompt / 聊天归档
// 不修改任何已有文件, 仅提供可被其他模块调用的函数 + 独立路由端点
// ================================================================
const OpenAI = require('openai');
const config = require('../ai/config');
const { query } = require('../config/db');

// 单例 LLM 客户端(复用 ai/config 的配置, 不重复读 .env)
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

// ================================================================
// 一、进销存业务数据 → 自动写入记忆
// 在销售/进货完成后调用, 把结构化摘要存入 tenant_shop_memory
// memory_type = sales_data, memory_source = business_data
// ================================================================

/**
 * 记录进销存业务数据到长期记忆
 * @param {number} tenantId   租户ID(从JWT获取,不接受前端传参)
 * @param {object} data       业务摘要 { biz_type, order_id, summary, amount, items, ... }
 * @param {number} importance 权重0-10, 默认6(业务数据重要性中等偏高)
 */
async function recordBusinessData(tenantId, data, importance = 6) {
  if (!tenantId || !data || !data.biz_type) {
    throw new Error('recordBusinessData: tenantId 和 data.biz_type 必填');
  }

  // 构造结构化记忆内容(不存原始订单明细全量,只存提炼后的摘要)
  const memoryContent = {
    biz_type: data.biz_type,           // sale / purchase / inventory_adjust
    order_id: data.order_id || null,
    summary: data.summary || '',       // 一句话摘要, 如 "销售3件商品, 总额¥180"
    amount: data.amount || 0,          // 金额
    item_count: data.item_count || 0,  // 商品种类数
    key_items: (data.items || []).slice(0, 5), // 最多记5个关键商品(节省token)
    recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };

  await query(
    `INSERT INTO tenant_shop_memory (tenant_id, memory_type, memory_content, memory_source, importance)
     VALUES (?, 'sales_data', ?, 'business_data', ?)`,
    [tenantId, JSON.stringify(memoryContent), Math.min(Math.max(importance, 0), 10)]
  );
  return { saved: true, content: memoryContent };
}

// ================================================================
// 二、AI对话 → LLM提取用户决策/偏好 → 写入记忆
// 在Agent对话结束后调用, 把用户透露的店铺偏好、经营决策提炼为结构化记忆
// memory_type = user_decision / shop_attr, memory_source = user_chat
// ================================================================

// LLM提取记忆的system prompt(要求返回JSON, 不返回原始对话)
const EXTRACT_PROMPT = `你是一个信息提取助手。分析用户和AI助手的对话,提取出关于店铺经营的长期有效信息。
只提取有长期参考价值的:用户决策、经营偏好、店铺属性、商业规律。
忽略一次性的操作指令(如"帮我查库存"、"开一张单")。

返回JSON数组,每个元素格式:
{"memory_type":"user_decision|shop_attr","memory_content":{结构化键值对},"importance":0-10的数字}
- user_decision: 用户的经营决策(如"以后进货都走XX供应商"、"利润低于20%的不卖")
- shop_attr: 店铺基础属性(如"主营生鲜"、"位于学校旁"、"目标客群是学生")

如果这段对话没有值得长期记忆的信息,返回空数组 []。
只返回JSON,不要加任何解释文字。`;

/**
 * 从一轮AI对话中提取用户记忆
 * @param {number} tenantId
 * @param {string} userMessage  用户这轮说的话
 * @param {string} aiReply      AI这轮回的回复
 * @returns {Promise<{extracted: Array, saved: number}>}
 */
async function extractMemoryFromChat(tenantId, userMessage, aiReply) {
  if (!tenantId || !userMessage) {
    return { extracted: [], saved: 0 };
  }

  const llm = getLLM();
  const resp = await llm.chat.completions.create({
    model: config.llm.model,
    messages: [
      { role: 'system', content: EXTRACT_PROMPT },
      { role: 'user', content: `用户: ${userMessage}\nAI回复: ${(aiReply || '').slice(0, 500)}` },
    ],
    temperature: 0.1,      // 低温度保证提取稳定
    max_tokens: 2000,      // 给足空间避免JSON被截断
    stream: false,
  });

  const raw = resp.choices[0]?.message?.content || '[]';
  let memories = [];
  try {
    // 容错提取: 找到第一个[和最后一个], 兼容LLM包裹markdown或添加多余文字
    let jsonStr = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    // 如果仍解析失败, 尝试截取第一个[ 到最后一个 ]
    try {
      memories = JSON.parse(jsonStr);
    } catch (e2) {
      const start = jsonStr.indexOf('[');
      const end = jsonStr.lastIndexOf(']');
      if (start >= 0 && end > start) {
        memories = JSON.parse(jsonStr.substring(start, end + 1));
      } else {
        memories = [];
      }
    }
  } catch (e) {
    console.log('[ShopMemory] 记忆提取解析失败, 跳过:', e.message, '| raw:', raw.substring(0, 200));
    return { extracted: [], saved: 0, raw };
  }

  // 逐条写入记忆表(只存结构化JSON, 不存原始对话)
  let saved = 0;
  for (const mem of memories) {
    if (!mem.memory_type || !mem.memory_content) continue;
    // 只允许两种类型
    if (!['user_decision', 'shop_attr'].includes(mem.memory_type)) continue;

    await query(
      `INSERT INTO tenant_shop_memory (tenant_id, memory_type, memory_content, memory_source, importance)
       VALUES (?, ?, ?, 'user_chat', ?)`,
      [
        tenantId,
        mem.memory_type,
        JSON.stringify(mem.memory_content),
        Math.min(Math.max(parseFloat(mem.importance) || 5, 0), 10),
      ]
    );
    saved++;
  }

  return { extracted: memories, saved };
}

// ================================================================
// 三、查询记忆 → 拼接进prompt头部(供AI Agent推理前调用)
// 调用 /top 获取高权重记忆, 格式化为简洁文本注入system prompt
// ================================================================

/**
 * 获取当前租户的高权重记忆, 格式化为prompt可用的文本块
 * @param {number} tenantId  从JWT获取
 * @param {number} limit     取前N条, 默认8
 * @returns {string} 格式化后的记忆文本, 可直接拼到prompt头部
 */
async function getMemoryForPrompt(tenantId, limit = 8) {
  const rows = await query(
    `SELECT memory_type, memory_content, importance
     FROM tenant_shop_memory
     WHERE tenant_id = ? AND deleted = 0
     ORDER BY importance DESC, update_time DESC
     LIMIT ?`,
    [tenantId, Math.min(parseInt(limit, 10) || 8, 30)]
  );

  if (!rows.length) { /* 无历史记忆, 继续注入实时业务数据 */ }

  // 按类型分组, 拼成简洁的"店铺记忆档案"
  const typeLabel = {
    sales_data: '经营数据',
    user_decision: '店主决策',
    shop_attr: '店铺属性',
    ai_summary: 'AI总结',
  };

  const lines = [];
  for (const r of rows) {
    const label = typeLabel[r.memory_type] || r.memory_type;
    // memory_content 可能是字符串或对象(mysql2 JSON类型)
    let content = r.memory_content;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch (e) { /* 保持字符串 */ }
    }
    // 把JSON对象扁平化为一行可读文本
    const flat = typeof content === 'object'
      ? Object.entries(content).map(function(entry){ var k=entry[0], v=entry[1]; return k + ':' + (typeof v === 'object' ? JSON.stringify(v) : v); }).join(', ')
      : String(content);
    lines.push(`[${label}](权重${r.importance}) ${flat}`);
  }

  return `\n## 店铺长期记忆(以下信息来自历史经营,供你参考)\n${lines.join('\n')}\n`;
}

// ================================================================
// 四、原始聊天归档(仅审计, 不参与AI推理)
// 写入 ai_chat_log_archive 表, 与 tenant_shop_memory 物理隔离
// ================================================================

/**
 * 归档一条原始聊天消息
 * @param {number} tenantId
 * @param {string} sessionId  会话ID
 * @param {string} role       user / assistant / system
 * @param {string} content    消息原文
 * @param {object} meta       元信息 { model, tokens, elapsed_ms, ... }
 */
async function archiveChatLog(tenantId, sessionId, role, content, meta) {
  await query(
    `INSERT INTO ai_chat_log_archive (tenant_id, session_id, role, content, meta_info)
     VALUES (?, ?, ?, ?, ?)`,
    [tenantId, sessionId || '', role, String(content), meta ? JSON.stringify(meta) : null]
  );
  return { archived: true };
}

module.exports = {
  recordBusinessData,
  extractMemoryFromChat,
  getMemoryForPrompt,
  archiveChatLog,
};


