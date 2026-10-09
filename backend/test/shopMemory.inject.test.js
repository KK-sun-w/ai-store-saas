// ================================================================
// 店铺长期记忆 —— extract/inject 专项测试 + HTTP安全校验
// 覆盖: extract提取校验 / inject输出格式 / 租户隔离 / 参数校验
// 运行: node --test test/shopMemory.inject.test.js
// ================================================================
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const db = require('../src/config/db');
const svc = require('../src/services/shopMemory.service');
const biz = require('../src/services/shopMemory.business');
const { signToken } = require('../src/middlewares/auth');

// 测试租户
const TENANT_A = 99910;
const TENANT_B = 99911;
const PORT = 3000;

// 辅助: 发送HTTP请求
function httpRequest(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: PORT, method, path, headers: { ...headers, 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data), raw: data }); }
        catch { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// 生成token
function makeToken(tenantId) {
  return signToken({ id: 1, username: 'test_user', tenant_id: tenantId });
}

beforeEach(async () => {
  await db.query('DELETE FROM tenant_shop_memory WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
  await db.query('DELETE FROM ai_chat_log_archive WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
});

after(async () => {
  await db.query('DELETE FROM tenant_shop_memory WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
  await db.query('DELETE FROM ai_chat_log_archive WHERE tenant_id IN (?, ?)', [TENANT_A, TENANT_B]);
});

// ================================================================
// 一、/extract 接口测试
// ================================================================
describe('/extract: LLM提取用户决策', () => {

  it('正常对话: 提取多条结构化记忆, memory_type和importance正确', async () => {
    // 模拟用户经营决策对话
    const result = await biz.extractMemoryFromChat(
      TENANT_A,
      '以后饮料全部从恒发批发进货,毛利低于20%的商品逐步淘汰,我的店主要做社区家庭生鲜',
      '好的,已记录您的经营策略'
    );

    // 应提取出至少2条记忆
    assert.ok(result.extracted.length >= 2, `应至少提取2条, 实际${result.extracted.length}条`);
    assert.ok(result.saved >= 2, `应至少写入2条, 实际${result.saved}条`);

    // 每条记忆的memory_type必须是合法枚举
    for (const mem of result.extracted) {
      assert.ok(['user_decision', 'shop_attr'].includes(mem.memory_type),
        `memory_type应为user_decision或shop_attr, 实际: ${mem.memory_type}`);
      // importance应在0-10范围内
      const imp = parseFloat(mem.importance);
      assert.ok(imp >= 0 && imp <= 10, `importance应在0-10, 实际: ${imp}`);
    }

    console.log('  提取结果:', JSON.stringify(result.extracted, null, 2));
  });

  it('非法内容: 操作指令类对话不生成记忆', async () => {
    // 用户只说了一次性操作指令, 没有长期经营决策
    const result = await biz.extractMemoryFromChat(
      TENANT_A,
      '帮我查一下今天的库存',
      '好的,当前库存如下: 可乐50件, 薯片30件'
    );

    // 这类对话不应提取出长期记忆(可能返回空数组)
    // 即使LLM返回了内容, 也不应有非法的memory_type
    for (const mem of result.extracted) {
      assert.ok(['user_decision', 'shop_attr'].includes(mem.memory_type),
        '即使是操作类对话, memory_type也必须合法');
    }
    console.log(`  操作类对话提取${result.extracted.length}条(允许为0)`);
  });

  it('空消息: 不报错, 返回空数组', async () => {
    const result = await biz.extractMemoryFromChat(TENANT_A, '', '');
    assert.strictEqual(result.extracted.length, 0, '空消息应返回0条');
    assert.strictEqual(result.saved, 0, '不应写入任何记忆');
  });
});

// ================================================================
// 二、/inject 接口测试 (getMemoryForPrompt)
// ================================================================
describe('/inject: 记忆注入prompt格式校验', () => {

  it('按importance权重从高到低排序', async () => {
    // 插入3条不同权重的记忆
    await svc.create(TENANT_A, { memory_type: 'shop_attr', memory_content: { tag: '低' }, importance: 2.0 });
    await svc.create(TENANT_A, { memory_type: 'shop_attr', memory_content: { tag: '高' }, importance: 9.5 });
    await svc.create(TENANT_A, { memory_type: 'shop_attr', memory_content: { tag: '中' }, importance: 5.0 });

    const text = await biz.getMemoryForPrompt(TENANT_A, 10);

    // 按权重降序: 高(9.5) → 中(5.0) → 低(2.0)
    const highIdx = text.indexOf('高');
    const midIdx = text.indexOf('中');
    const lowIdx = text.indexOf('低');
    assert.ok(highIdx > -1, '应包含高权重记忆');
    assert.ok(highIdx < midIdx, '高权重应在中权重前');
    assert.ok(midIdx < lowIdx, '中权重应在低权重前');
  });

  it('输出是干净prompt文本, 不含JSON符号垃圾', async () => {
    await svc.create(TENANT_A, {
      memory_type: 'user_decision',
      memory_content: { rule: '利润底线20%', supplier: '恒发批发' },
      importance: 8.0,
    });

    const text = await biz.getMemoryForPrompt(TENANT_A, 10);

    // 不应包含原始JSON的花括号和引号
    assert.ok(!text.includes('{'), '不应包含JSON左花括号');
    assert.ok(!text.includes('}'), '不应包含JSON右花括号');
    assert.ok(!text.includes('"'), '不应包含JSON双引号');

    // 应包含记忆标题和权重标注
    assert.ok(text.includes('店铺长期记忆'), '应包含记忆段标题');
    assert.ok(text.includes('权重'), '应包含权重标注');

    // 应包含实际记忆内容(扁平化后的文本)
    assert.ok(text.includes('利润底线20%'), '应包含记忆内容: 利润底线');
    assert.ok(text.includes('恒发批发'), '应包含记忆内容: 恒发批发');
  });

  it('不混入原始聊天记录文本', async () => {
    // 在记忆表写入结构化记忆
    await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { type: '社区生鲜' },
      importance: 9.0,
    });
    // 在聊天归档表写入原始聊天(不应出现在inject输出中)
    const rawChat = '用户: 帮我看看今天的销售报表,我想了解可乐和薯片的销量';
    await biz.archiveChatLog(TENANT_A, 'sess_test', 'user', rawChat, { model: 'test' });

    const text = await biz.getMemoryForPrompt(TENANT_A, 10);

    // 应包含结构化记忆
    assert.ok(text.includes('社区生鲜'), '应包含店铺属性记忆');
    // 不应包含原始聊天
    assert.ok(!text.includes('帮我看看'), '不应包含原始聊天内容');
    assert.ok(!text.includes('销售报表'), '不应包含原始聊天内容');
    assert.ok(!text.includes('sess_test'), '不应包含会话ID');
  });

  it('租户无任何记忆时返回空字符串, 不报错', async () => {
    const text = await biz.getMemoryForPrompt(TENANT_A, 10);
    assert.strictEqual(text, '', '无记忆应返回空字符串');
    assert.ok(typeof text === 'string', '返回类型应为字符串');
  });
});

// ================================================================
// 三、HTTP层安全校验: tenant_id隔离
// ================================================================
describe('HTTP安全: tenant_id强制从JWT读取', () => {

  it('POST /extract: 前端传tenant_id参数应被忽略, 使用JWT的tenant_id', async () => {
    const tokenA = makeToken(TENANT_A);
    // 故意在body中传另一个租户的tenant_id, 应被忽略
    const resp = await httpRequest('POST', '/api/shop-memory/extract', {
      Authorization: `Bearer ${tokenA}`,
    }, {
      tenant_id: TENANT_B,  // 尝试越权传入别的租户ID
      user_message: '我的店做社区生鲜,以后进货走恒发批发',
      ai_reply: '好的已记录',
    });

    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.json.code, 0);

    // 验证: 记忆应写入TENANT_A(JWT的tenant_id), 不是TENANT_B
    const memA = await svc.list(TENANT_A, { page: 1, pageSize: 50 });
    const memB = await svc.list(TENANT_B, { page: 1, pageSize: 50 });
    assert.ok(memA.total >= 1, '记忆应写入JWT对应的租户A');
    assert.strictEqual(memB.total, 0, '记忆不应写入body传入的租户B');
  });

  it('GET /inject: 前端传tenant_id查询参数应被忽略, 使用JWT的tenant_id', async () => {
    // 租户A写入记忆
    await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { secret: '租户A机密' },
      importance: 9.0,
    });
    // 租户B写入记忆
    await svc.create(TENANT_B, {
      memory_type: 'shop_attr',
      memory_content: { secret: '租户B机密' },
      importance: 10.0,
    });

    const tokenA = makeToken(TENANT_A);
    // 用租户A的token, 但query里传tenant_id=B, 应仍返回A的记忆
    const resp = await httpRequest('GET', '/api/shop-memory/inject?limit=10&tenant_id=' + TENANT_B, {
      Authorization: `Bearer ${tokenA}`,
    });

    assert.strictEqual(resp.status, 200);
    const text = resp.json.data.memory_text;
    // 应包含租户A的记忆, 不包含租户B的
    assert.ok(text.includes('租户A机密'), '应返回JWT租户A的记忆');
    assert.ok(!text.includes('租户B机密'), '不应返回body传入的租户B的记忆');
  });

  it('无Authorization头应返回401', async () => {
    const resp = await httpRequest('GET', '/api/shop-memory/inject', {}, null);
    assert.strictEqual(resp.status, 401, '无token应401');
  });
});

// ================================================================
// 四、参数校验: importance范围 + memory_type枚举
// ================================================================
describe('参数校验: importance和memory_type', () => {

  it('importance=15被截断为10', async () => {
    const r = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { t: 1 },
      importance: 15,
    });
    const d = await svc.detail(TENANT_A, r.id);
    assert.strictEqual(parseFloat(d.importance), 10, 'importance=15应截断为10');
  });

  it('importance=-3被截断为0', async () => {
    const r = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { t: 2 },
      importance: -3,
    });
    const d = await svc.detail(TENANT_A, r.id);
    assert.strictEqual(parseFloat(d.importance), 0, 'importance=-3应截断为0');
  });

  it('importance=7.5正常接受', async () => {
    const r = await svc.create(TENANT_A, {
      memory_type: 'shop_attr',
      memory_content: { t: 3 },
      importance: 7.5,
    });
    const d = await svc.detail(TENANT_A, r.id);
    assert.strictEqual(parseFloat(d.importance), 7.5, 'importance=7.5应正常存储');
  });

  it('非法memory_type=custom_value报错', async () => {
    await assert.rejects(
      () => svc.create(TENANT_A, { memory_type: 'custom_value', memory_content: { t: 1 }, importance: 5 }),
      /memory_type 必须为/,
      '非法memory_type应报错'
    );
  });

  it('memory_type=null报错', async () => {
    await assert.rejects(
      () => svc.create(TENANT_A, { memory_type: null, memory_content: { t: 1 }, importance: 5 }),
      /memory_type 必须为/,
      'null memory_type应报错'
    );
  });

  it('extract提取的记忆memory_type只能是user_decision或shop_attr', async () => {
    const result = await biz.extractMemoryFromChat(
      TENANT_A,
      '我的店做社区生鲜,利润低于15%的不进货',
      '已记录'
    );
    for (const mem of result.extracted) {
      assert.ok(
        mem.memory_type === 'user_decision' || mem.memory_type === 'shop_attr',
        `extract只允许user_decision/shop_attr, 实际: ${mem.memory_type}`
      );
    }
  });
});
