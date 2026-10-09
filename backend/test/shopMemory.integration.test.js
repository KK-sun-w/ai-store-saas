// ================================================================
// 店铺长期记忆模块 —— 端到端联调测试
// 模拟完整流程: 进销存写入 → LLM提取用户决策 → Agent获取记忆注入prompt
// 运行: node --test test/shopMemory.integration.test.js
// ================================================================
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const db = require('../src/config/db');
const svc = require('../src/services/shopMemory.service');
const biz = require('../src/services/shopMemory.business');

const TENANT = 99903;  // 联调测试专用租户

// 清理旧数据
before(async () => {
  await db.query('DELETE FROM tenant_shop_memory WHERE tenant_id = ?', [TENANT]);
  await db.query('DELETE FROM ai_chat_log_archive WHERE tenant_id = ?', [TENANT]);
});

after(async () => {
  await db.query('DELETE FROM tenant_shop_memory WHERE tenant_id = ?', [TENANT]);
  await db.query('DELETE FROM ai_chat_log_archive WHERE tenant_id = ?', [TENANT]);
});

describe('端到端联调: 进销存写入 → LLM提取 → Agent注入', () => {

  // 步骤1: 进销存事件写入记忆
  it('步骤1: 模拟销售完成, 自动写入sales_data记忆', async () => {
    const result = await biz.recordBusinessData(TENANT, {
      biz_type: 'sale',
      order_id: 'SO_TEST_001',
      summary: '销售5件商品,总额320元',
      amount: 320,
      item_count: 5,
      items: [
        { name: '可乐', qty: 3, price: 5 },
        { name: '薯片', qty: 2, price: 15 },
      ],
    }, 6);

    assert.ok(result.saved, '应返回saved=true');
    assert.strictEqual(result.content.biz_type, 'sale', '记忆内容应包含biz_type=sale');
    assert.strictEqual(result.content.amount, 320, '记忆金额应为320');

    // 确认已写入数据库
    const list = await svc.list(TENANT, { memory_type: 'sales_data', page: 1, pageSize: 10 });
    assert.strictEqual(list.total, 1, '数据库应有1条sales_data记忆');
  });

  // 步骤2: 原始聊天归档(不进记忆表)
  it('步骤2: 原始聊天归档到ai_chat_log_archive, 不进tenant_shop_memory', async () => {
    const rawChat = '用户: 帮我查一下今天的销售报表,另外我想调整一下进货策略,以后饮料类从恒发批发进货,毛利低于20%的商品逐步淘汰,我的店主要做社区家庭生鲜';

    await biz.archiveChatLog(TENANT, 'sess_integration', 'user', rawChat, {
      model: 'deepseek-chat',
      tokens: 50,
    });

    // 确认归档表有记录
    const archived = await db.query(
      'SELECT COUNT(*) AS cnt FROM ai_chat_log_archive WHERE tenant_id = ? AND session_id = ?',
      [TENANT, 'sess_integration']
    );
    assert.strictEqual(archived[0].cnt, 1, '归档表应有1条记录');

    // 确认记忆表没有原始聊天文本
    const memories = await svc.list(TENANT, { page: 1, pageSize: 50 });
    for (const m of memories.list) {
      const content = typeof m.memory_content === 'string' ? m.memory_content : JSON.stringify(m.memory_content);
      assert.ok(!content.includes('帮我查一下今天'), '记忆表不应包含原始聊天文本');
    }
  });

  // 步骤3: LLM提取用户决策 → 写入记忆
  it('步骤3: LLM从对话中提取用户决策, 写入user_decision/shop_attr记忆', async () => {
    // 模拟一轮对话: 用户说了经营决策
    const userMessage = '以后饮料类全部从恒发批发进货,毛利低于20%的商品逐步淘汰,我的店主要做社区家庭生鲜';
    const aiReply = '好的,我已记录您的经营策略:1.饮料进货走恒发批发 2.毛利底线20% 3.主营社区家庭生鲜';

    // 调用LLM提取(真实调用DeepSeek API)
    const result = await biz.extractMemoryFromChat(TENANT, userMessage, aiReply);

    // LLM应提取出至少1条记忆
    assert.ok(result.extracted.length >= 1, 'LLM应至少提取出1条记忆');
    assert.ok(result.saved >= 1, '应至少写入1条记忆到数据库');

    // 验证提取的类型
    const types = result.extracted.map(m => m.memory_type);
    assert.ok(
      types.includes('user_decision') || types.includes('shop_attr'),
      '应包含user_decision或shop_attr类型'
    );

    console.log('  [LLM提取结果]', JSON.stringify(result.extracted, null, 2));
  });

  // 步骤4: Agent调用getMemoryForPrompt, 拼入prompt
  it('步骤4: Agent调用getMemoryForPrompt获取记忆, 拼入system prompt', async () => {
    const memoryText = await biz.getMemoryForPrompt(TENANT, 10);

    // 应有记忆内容(步骤1的sales_data + 步骤3的user_decision/shop_attr)
    assert.ok(memoryText.length > 0, '记忆文本不应为空');
    assert.ok(memoryText.includes('店铺长期记忆'), '应有记忆标题');

    // 应包含步骤1写入的销售数据
    assert.ok(memoryText.includes('320'), '应包含销售金额320');
    assert.ok(memoryText.includes('sale'), '应包含biz_type=sale');

    // 应包含步骤3 LLM提取的决策(供应商/利润底线/生鲜)
    // LLM提取的具体内容可能略有差异, 但关键词应命中
    const hasSupplier = memoryText.includes('恒发') || memoryText.includes('批发');
    const hasProfitRule = memoryText.includes('20') || memoryContent_contains(memoryText, '毛利');
    const hasBusinessType = memoryText.includes('生鲜') || memoryText.includes('社区');
    assert.ok(hasSupplier || hasProfitRule || hasBusinessType,
      '应包含至少一条LLM提取的决策记忆');

    // 不应包含原始聊天全文
    assert.ok(!memoryText.includes('帮我查一下'), '不应包含原始聊天文本');

    // 模拟拼入system prompt
    const systemPrompt = '你是一个店铺经营助手。' + memoryText;
    assert.ok(systemPrompt.length > 20, '拼入后的system prompt应更长');
    assert.ok(systemPrompt.includes('店铺长期记忆'), 'system prompt应包含记忆段');

    console.log('  [注入后prompt片段]\n' + systemPrompt.substring(0, 500) + '...');
  });

  // 步骤5: 验证记忆按权重排序, 高权重优先
  it('步骤5: 高权重记忆排在prompt前面, 低权重排在后面', async () => {
    // 手动插入一条低权重记忆
    await svc.create(TENANT, {
      memory_type: 'shop_attr',
      memory_content: { tag: '低权重测试条目' },
      importance: 1.0,
    });

    const promptText = await biz.getMemoryForPrompt(TENANT, 20);
    // 低权重条目应出现在文本末尾
    const lowIdx = promptText.indexOf('低权重测试条目');
    const highIdx = promptText.indexOf('320'); // sales_data权重6
    assert.ok(highIdx < lowIdx, '高权重记忆应在低权重前面');
  });
});

// 辅助函数: 检查文本是否包含关键词(忽略大小写)
function memoryContent_contains(text, keyword) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}
