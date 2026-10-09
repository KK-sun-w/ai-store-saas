// ================================================================
// 店铺长期记忆模块 —— 单元测试
// 使用 Node.js 内置 node:test 框架, 零依赖
// 运行: node --test test/shopMemory.test.js
// ================================================================
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const db = require('../src/config/db');
const svc = require('../src/services/shopMemory.service');
const biz = require('../src/services/shopMemory.business');

// 测试用的租户ID
const TENANT_A = 99901;  // 租户A
const TENANT_B = 99902;  // 租户B(模拟越权)

// 每个测试前清理测试数据
beforeEach(async () => {
  await db.query('DELETE FROM tenant_shop_memory WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
  await db.query('DELETE FROM ai_chat_log_archive WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
});

// 测试结束后清理
after(async () => {
  await db.query('DELETE FROM tenant_shop_memory WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
  await db.query('DELETE FROM ai_chat_log_archive WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
});

// ================================================================
// 一、正常流程: 新增 → top读取 → 更新 → 删除
// ================================================================
describe('正常流程: CRUD', () => {

  it('新增记忆 → 按权重top读取 → 更新 → 删除', async () => {
    // 1. 新增3条记忆, 权重不同
    const r1 = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { shop_name: '测试店铺A', industry: '零售' },
      memory_source: 'user_chat',
      importance: 5.0,
    });
    const r2 = await svc.create(TENANT_A, {
      memory_type: 'user_decision',
      memory_content: { decision: '利润低于15%不卖' },
      memory_source: 'user_chat',
      importance: 9.0,
    });
    const r3 = await svc.create(TENANT_A, {
      memory_type: 'sales_data',
      memory_content: { biz_type: 'sale', amount: 200, summary: '销售2件' },
      memory_source: 'business_data',
      importance: 6.0,
    });
    assert.ok(r1.id > 0, '应返回自增ID');
    assert.ok(r2.id > 0);
    assert.ok(r3.id > 0);

    // 2. 按权重top读取: 应按 importance DESC 排序
    const top = await svc.listTopMemories(TENANT_A, 10);
    assert.strictEqual(top.length, 3, '应有3条记忆');
    // 权重最高的排第一(importance=9.0)
    assert.strictEqual(top[0].importance, '9.0', '第一条应为权重9.0');
    assert.strictEqual(top[1].importance, '6.0', '第二条应为权重6.0');
    assert.strictEqual(top[2].importance, '5.0', '第三条应为权重5.0');

    // 3. 更新记忆: 调整权重
    await svc.update(TENANT_A, r1.id, { importance: 9.5 });
    const detail = await svc.detail(TENANT_A, r1.id);
    assert.strictEqual(detail.importance, '9.5', '权重应更新为9.5');

    // 4. 删除记忆
    await svc.remove(TENANT_A, r1.id);
    // 删除后再查应抛404
    await assert.rejects(
      () => svc.detail(TENANT_A, r1.id),
      { message: '记忆不存在' },
      '删除后应查不到'
    );
  });

  it('list支持分页和筛选', async () => {
    // 插入5条: 3条shop_attr, 2条user_decision
    for (let i = 0; i < 3; i++) {
      await svc.create(TENANT_A, {
        memory_type: 'shop_attr',
        memory_content: { idx: i },
        importance: 5.0 + i,
      });
    }
    for (let i = 0; i < 2; i++) {
      await svc.create(TENANT_A, {
        memory_type: 'user_decision',
        memory_content: { idx: i },
        importance: 8.0,
      });
    }

    // 按类型筛选
    const shopAttrs = await svc.list(TENANT_A, { memory_type: 'shop_attr', page: 1, pageSize: 10 });
    assert.strictEqual(shopAttrs.total, 3, 'shop_attr应有3条');

    const decisions = await svc.list(TENANT_A, { memory_type: 'user_decision', page: 1, pageSize: 10 });
    assert.strictEqual(decisions.total, 2, 'user_decision应有2条');

    // 按最低权重筛选
    const highOnly = await svc.list(TENANT_A, { min_importance: 8, page: 1, pageSize: 10 });
    assert.strictEqual(highOnly.total, 2, '权重>=8的应有2条');
  });
});

// ================================================================
// 二、多租户安全测试: 租户B不能读写租户A的记忆
// ================================================================
describe('多租户安全隔离', () => {

  it('租户B不能读取租户A的记忆详情', async () => {
    // 租户A新增一条
    const r = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { secret: '这是租户A的机密' },
      importance: 9.0,
    });

    // 租户B尝试读取 → 应404
    await assert.rejects(
      () => svc.detail(TENANT_B, r.id),
      { message: '记忆不存在' },
      '租户B不应能读取租户A的记忆'
    );
  });

  it('租户B不能更新租户A的记忆', async () => {
    const r = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { data: '原值' },
      importance: 5.0,
    });

    // 租户B尝试更新 → 应404(租户隔离校验)
    await assert.rejects(
      () => svc.update(TENANT_B, r.id, { importance: 10 }),
      { message: '记忆不存在' },
      '租户B不应能更新租户A的记忆'
    );

    // 确认租户A的数据未被篡改
    const check = await svc.detail(TENANT_A, r.id);
    assert.strictEqual(check.importance, '5.0', '权重应未被修改');
  });

  it('租户B不能删除租户A的记忆', async () => {
    const r = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { data: '不可删除' },
      importance: 7.0,
    });

    // 租户B尝试删除 → 应404
    await assert.rejects(
      () => svc.remove(TENANT_B, r.id),
      { message: '记忆不存在' },
      '租户B不应能删除租户A的记忆'
    );

    // 确认记忆仍存在
    const check = await svc.detail(TENANT_A, r.id);
    assert.ok(check, '租户A的记忆应仍存在');
  });

  it('topMemories只返回当前租户的记忆', async () => {
    // 租户A和租户B各插入数据
    await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { owner: 'A' },
      importance: 9.0,
    });
    await svc.create(TENANT_B, {
      memory_type: 'shop_attr',
      memory_content: { owner: 'B' },
      importance: 10.0,
    });

    // 租户A的top应只有A的数据
    const topA = await svc.listTopMemories(TENANT_A, 5);
    assert.strictEqual(topA.length, 1, '租户A应只有1条');
    const contentA = typeof topA[0].memory_content === 'string'
      ? JSON.parse(topA[0].memory_content) : topA[0].memory_content;
    assert.strictEqual(contentA.owner, 'A', '应是租户A的数据');

    // 租户B的top应只有B的数据
    const topB = await svc.listTopMemories(TENANT_B, 5);
    assert.strictEqual(topB.length, 1, '租户B应只有1条');
    const contentB = typeof topB[0].memory_content === 'string'
      ? JSON.parse(topB[0].memory_content) : topB[0].memory_content;
    assert.strictEqual(contentB.owner, 'B', '应是租户B的数据');
  });
});

// ================================================================
// 三、参数校验测试
// ================================================================
describe('参数校验', () => {

  it('importance超出0-10区间应被自动截断', async () => {
    // importance=15 应被截断为10
    const r1 = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { test: 1 },
      importance: 15,  // 超出上限
    });
    const d1 = await svc.detail(TENANT_A, r1.id);
    assert.strictEqual(d1.importance, '10.0', 'importance=15应被截断为10');

    // importance=-5 应被截断为0
    const r2 = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { test: 2 },
      importance: -5,  // 低于下限
    });
    const d2 = await svc.detail(TENANT_A, r2.id);
    assert.strictEqual(d2.importance, '0.0', 'importance=-5应被截断为0');
  });

  it('非法memory_type应返回报错', async () => {
    await assert.rejects(
      () => svc.create(TENANT_A, {
        memory_type: 'invalid_type',  // 非法类型
        memory_content: { test: 1 },
        importance: 5,
      }),
      /memory_type 必须为/,
      '非法memory_type应报错'
    );

    // 空memory_type也应报错
    await assert.rejects(
      () => svc.create(TENANT_A, {
        memory_type: '',
        memory_content: { test: 1 },
        importance: 5,
      }),
      /memory_type 必须为/,
      '空memory_type应报错'
    );
  });

  it('memory_content为空应报错', async () => {
    await assert.rejects(
      () => svc.create(TENANT_A, {
        memory_type: 'shop_attr',
        memory_content: null,
        importance: 5,
      }),
      /memory_content 不能为空/,
      'memory_content为空应报错'
    );
  });

  it('更新时传入非法memory_type应报错', async () => {
    const r = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { test: 1 },
      importance: 5,
    });
    await assert.rejects(
      () => svc.update(TENANT_A, r.id, { memory_type: 'hacked' }),
      /memory_type 必须为/,
      '更新时非法类型应报错'
    );
  });
});

// ================================================================
// 四、getMemoryForPrompt: 只返回结构化JSON, 不返回原始聊天
// ================================================================
describe('getMemoryForPrompt 安全性', () => {

  it('只返回tenant_shop_memory的结构化内容, 不返回ai_chat_log_archive的原始聊天', async () => {
    // 1. 在记忆表插入结构化记忆
    await svc.create(TENANT_A, {
      memory_type: 'user_decision',
      memory_content: { rule: '利润低于15%不卖' },
      importance: 9.0,
    });
    await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { business_type: '社区生鲜' },
      importance: 8.0,
    });

    // 2. 在聊天归档表插入原始聊天(模拟用户大段对话)
    const rawChat = '用户: 帮我看看今天销售情况... 这是一段很长的原始聊天内容, 不应该出现在记忆prompt中';
    await biz.archiveChatLog(TENANT_A, 'sess_test', 'user', rawChat, { model: 'test' });

    // 3. 调用getMemoryForPrompt获取注入文本
    const promptText = await biz.getMemoryForPrompt(TENANT_A, 10);

    // 4. 验证: 应包含结构化记忆内容
    assert.ok(promptText.includes('利润低于15%不卖'), '应包含用户决策记忆');
    assert.ok(promptText.includes('社区生鲜'), '应包含店铺属性记忆');

    // 5. 验证: 不应包含原始聊天文本
    assert.ok(!promptText.includes(rawChat), '不应包含原始聊天文本');
    assert.ok(!promptText.includes('帮我看看今天销售'), '不应包含原始对话内容');

    // 6. 验证: 返回格式是结构化文本块, 不是原始JSON或聊天
    assert.ok(promptText.includes('店铺长期记忆'), '应有记忆标题');
    assert.ok(promptText.includes('权重'), '应有权重标注');
  });

  it('无记忆时返回空字符串', async () => {
    const promptText = await biz.getMemoryForPrompt(TENANT_A, 10);
    assert.strictEqual(promptText, '', '无记忆时应返回空字符串');
  });

  it('按权重降序排列, 高权重记忆排在前面', async () => {
    await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { tag: '低权重' },
      importance: 3.0,
    });
    await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { tag: '高权重' },
      importance: 9.5,
    });
    await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { tag: '中权重' },
      importance: 6.0,
    });

    const promptText = await biz.getMemoryForPrompt(TENANT_A, 10);
    // 高权重应出现在低权重之前
    const highIdx = promptText.indexOf('高权重');
    const midIdx = promptText.indexOf('中权重');
    const lowIdx = promptText.indexOf('低权重');
    assert.ok(highIdx < midIdx, '高权重应排在中等权重前');
    assert.ok(midIdx < lowIdx, '中权重应排在低权重前');
  });
});
