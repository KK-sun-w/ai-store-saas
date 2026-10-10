# AI门店智能体SaaS系统 ai-store-saas
> 面向中小门店的AI进销存SaaS平台，内置多Agent自动处理商品条码识别、库存管理、营销文案生成、单据处理。

## ✨项目简介
本SaaS系统为B端门店打造，整合AI Agent能力，替代大量重复人工操作。
核心能力：
1. 商品条码拍照识别，自动匹配商品档案，快速录入进销存
2. 多租户隔离，不同门店独立数据，企业级权限校验
3. AI Agent自动生成入库单、销售单据、库存预警、商品营销文案
4. 完整Agent链路：接收用户请求→任务规划→工具调用→结果校验→记忆存储→终止判断
5. 前端Vue3+Vite，后端Node.js+Express，配套数据库迁移脚本

## 📁仓库目录结构

```
ai-store-saas/
├── backend/                          # 后端服务（Node.js + Express）
│   ├── src/
│   │   ├── agents/                   # 各业务Agent模块
│   │   │   ├── agentUtils.js         # Agent通用工具
│   │   │   ├── inventory.agent.js     # 库存分析Agent
│   │   │   ├── marketing.agent.js     # 短视频营销Agent
│   │   │   ├── procurement.agent.js  # 采购建议Agent
│   │   │   ├── product.agent.js       # 商品运营Agent
│   │   │   ├── sales.agent.js         # 销售报表Agent
│   │   │   └── supervisor.agent.js   # 门店商业导师Agent
│   │   ├── ai/                        # AI核心引擎
│   │   │   ├── agent.js               # ReAct Agent主链路
│   │   │   ├── config.js              # Agent配置（prompt/工具映射）
│   │   │   ├── tools.js               # 工具定义与权限校验
│   │   │   └── prompts/
│   │   │       └── mentor.prompt.js  # 门店导师系统提示词
│   │   ├── config/                    # 配置层
│   │   │   ├── db.js                  # MySQL连接池
│   │   │   ├── env.js                 # 环境变量加载
│   │   │   └── upload.js              # 文件上传配置
│   │   ├── controllers/               # 控制器（22个）
│   │   │   ├── auth.controller.js     # 注册/登录
│   │   │   ├── product.controller.js  # 商品CRUD
│   │   │   ├── sales.controller.js    # 销售开单
│   │   │   ├── purchase.controller.js # 采购入库
│   │   │   ├── inventory.controller.js# 库存盘点
│   │   │   ├── storeAgent.controller.js# 门店综合业务Agent入口
│   │   │   ├── quota.controller.js    # AI配额查询
│   │   │   ├── digitalHuman.controller.js# 即梦数字人管理
│   │   │   ├── videoGenerate.controller.js# 视频生成
│   │   │   ├── operationLog.controller.js# 操作审计
│   │   │   └── ...                    # 其余控制器
│   │   ├── middlewares/               # 中间件
│   │   │   ├── auth.js                # JWT认证
│   │   │   ├── requirePerm.js         # RBAC权限校验
│   │   │   ├── security.js            # helmet+限流+xss防护
│   │   │   ├── operationLog.js        # 操作审计日志
│   │   │   ├── checkTokenQuota.js     # Token配额校验
│   │   │   ├── errorHandler.js        # 全局错误处理
│   │   │   └── validate.js            # 参数校验
│   │   ├── routes/                    # 路由（23个模块）
│   │   │   ├── index.js               # 路由聚合
│   │   │   ├── admin.route.js         # 管理员接口
│   │   │   ├── auth.route.js          # 认证路由
│   │   │   └── ...                    # 其余业务路由
│   │   ├── services/                  # 业务逻辑层（17个）
│   │   │   ├── auth.service.js        # 注册登录+租户初始化
│   │   │   ├── jimengApi.service.js   # 即梦视频生成API
│   │   │   ├── jimengSign.js          # 火山引擎V4签名
│   │   │   ├── tokenQuota.service.js  # Token配额管理
│   │   │   ├── shopMemory.service.js  # 店铺记忆存储
│   │   │   ├── toolAudit.service.js   # Agent工具审计
│   │   │   └── ...                    # 其余service
│   │   ├── utils/                     # 工具层
│   │   │   ├── tokenQuota.js          # Token配额原子扣减
│   │   │   ├── circuitBreaker.js       # LLM熔断器
│   │   │   ├── llmRetry.js             # 指数退避重试
│   │   │   ├── logger.js               # winston日志
│   │   │   ├── appError.js             # 自定义错误类
│   │   │   └── ...                    # 其余工具
│   │   ├── app.js                     # Express应用入口
│   │   ├── server.js                  # 服务启动+定时任务
│   │   └── migrate.js                 # 数据库迁移
│   ├── utils/
│   │   └── llm.js                     # LLM调用层（配额校验+扣减）
│   ├── sql/                           # 数据库脚本
│   │   ├── schema.sql                 # 完整建表脚本
│   │   ├── migrate_agent_token_quota.sql  # Agent Token配额迁移
│   │   ├── migrate_digital_human.sql     # 数字人表迁移
│   │   ├── migrate_operation_log.sql     # 操作审计表迁移
│   │   ├── migrate_shop_memory.sql       # 店铺记忆表迁移
│   │   ├── migrate_tool_call_log.sql     # 工具调用审计表迁移
│   │   └── ...
│   ├── scripts/
│   │   └── backup-db.js               # 定时数据库备份
│   ├── test/                          # 单元测试
│   ├── .env.example                   # 环境变量模板
│   └── package.json
│
├── frontend/                          # 前端应用（Vue3 + Vite + Element Plus）
│   ├── src/
│   │   ├── api/                       # API请求层（17个模块）
│   │   │   ├── request.js             # axios封装+JWT拦截
│   │   │   ├── auth.js                # 认证接口
│   │   │   ├── agent.js               # Agent接口
│   │   │   ├── quota.js               # 配额接口
│   │   │   └── ...
│   │   ├── views/                     # 页面组件
│   │   │   ├── dashboard.vue          # 首页仪表盘
│   │   │   ├── login.vue / register.vue
│   │   │   ├── layout.vue             # 全局布局
│   │   │   ├── product/               # 商品管理（列表+详情）
│   │   │   ├── inventory/             # 库存管理
│   │   │   ├── sales/                 # 销售开单
│   │   │   ├── purchase/             # 采购入库
│   │   │   ├── expense/              # 开销管理
│   │   │   ├── quota/                # AI配额页面
│   │   │   ├── agent/                # Agent页面
│   │   │   │   ├── storeBusiness.vue  # 门店综合业务Agent
│   │   │   │   ├── videoMarketing.vue # 短视频营销Agent
│   │   │   │   ├── memory.vue         # 店铺记忆
│   │   │   │   ├── history.vue        # 对话记录
│   │   │   │   └── ...
│   │   │   ├── admin/
│   │   │   │   └── tokenStats.vue     # Token统计（管理员）
│   │   │   └── error/
│   │   │       └── 403.vue            # 无权限页
│   │   ├── components/
│   │   │   └── AiAgentDrawer.vue      # AI Agent抽屉组件
│   │   ├── router/
│   │   │   └── index.js               # 路由守卫+动态菜单
│   │   ├── stores/                    # Pinia状态
│   │   │   ├── user.js                # 用户状态+权限
│   │   │   └── app.js
│   │   ├── utils/
│   │   │   └── scanner.js             # ZXing条码识别
│   │   ├── styles/
│   │   │   └── index.css
│   │   ├── App.vue
│   │   └── main.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── .gitignore
```

## 🛠技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Element Plus + Pinia + Vue Router |
| 后端 | Node.js + Express + MySQL（mysql2连接池） |
| AI   | DeepSeek API + ReAct Agent + 自定义工具链 |
| 多媒体 | 即梦数字人API + ffmpeg + ZXing条码 |
| 安全  | JWT + RBAC + helmet + 限流 + bcrypt + 操作审计 |
| 运维  | PM2 + winston日志 + 定时备份 + 熔断器 |

## 🚀核心特性

### 多租户企业级架构
- 所有业务表强制携带 `tenant_id`，数据行级隔离
- RBAC 三级角色：admin（创始人）/ owner（店主）/ staff（店员）
- JWT 中提取 tenant_id 和 role，禁止前端传参，杜绝越权

### AI Agent完整ReAct链路
1. **接收**用户自然语言请求
2. **权限校验**（角色+工具权限）
3. **规划**（LLM分解任务）
4. **工具调用**（查商品/库存/销售/采购）
5. **执行**（调用后端service层，不直接操作DB）
6. **观察**（收集工具返回）
7. **反思**（独立LLM质检回复质量）
8. **记忆更新**（异步提取用户决策写入店铺记忆）
9. **终止**（返回最终回复）

### Agent Token配额管理
- 新租户默认赠送50万Token体验额度
- 调用前校验余额，调用成功后按usage扣减
- 熔断/超时/4xx不扣Token，保护用户权益
- ReAct每轮独立校验，额度耗尽立即终止
- 永久流水对账，支持成本排查

### 短视频营销Agent
- 对接即梦数字人API（火山引擎V4签名）
- 自动生成商品营销短视频
- 异步任务轮询 + 失败降级本地ffmpeg合成
- 仅店主可见，严格多租户隔离

## 📦本地开发

```bash
# 后端
cd backend
npm install
cp .env.example .env   # 填入数据库和API Key
npm run dev

# 前端
cd frontend
npm install
npm run dev
```

## 📄License
MIT
