-- ============================================================
-- ai_store_saas 多租户实体店 AI 门店智能体 完整数据库脚本
-- 内容:建库 + 16 张表结构 + 角色/权限点初始化数据
-- 适用:MySQL 8.x   字符集:utf8mb4
-- 执行:mysql -u root -p < schema.sql  (或整段复制到客户端执行)
-- ============================================================
SET NAMES utf8mb4;
 
CREATE DATABASE IF NOT EXISTS `ai_store_saas`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `ai_store_saas`;
 
-- ==================================================================
-- 一、租户根表(商户) —— 其 id 即为全局 tenant_id
-- ==================================================================
CREATE TABLE `tenant` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID(即全局tenant_id)',
  `merchant_name` VARCHAR(64)  NOT NULL COMMENT '商户名称',
  `store_name`    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '门店名称',
  `industry`      VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '行业/经营类目',
  `contact_phone` VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '联系人手机号(售后服务用)',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '状态:1启用 0禁用',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`contact_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户(商户)表';
 
-- ==================================================================
-- 二、业务表(全部含 tenant_id,做多租户隔离)
-- ==================================================================
 
-- 2. 商户用户表(登录账号,支持一商户多员工)
CREATE TABLE `tenant_user` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`       BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `username`        VARCHAR(64)  NOT NULL COMMENT '登录用户名',
  `password_hash`   VARCHAR(128) NOT NULL COMMENT '登录密码哈希(不可明文)',
  `real_name`       VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '真实姓名',
  `role`            VARCHAR(20)  NOT NULL DEFAULT 'owner' COMMENT '角色:owner店主 staff店员',
  `status`          TINYINT      NOT NULL DEFAULT 1 COMMENT '状态:1启用 0禁用',
  `last_login_time` DATETIME     NULL COMMENT '最后登录时间',
  `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_username` (`tenant_id`, `username`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商户用户表';
 
-- 3. 商品表
CREATE TABLE `product` (
  `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`               BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `sku_code`                VARCHAR(64)  NOT NULL COMMENT '商品SKU编码',
  `name`                    VARCHAR(128) NOT NULL COMMENT '商品名称',
  `category`                VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '商品分类',
  `unit`                    VARCHAR(16)  NOT NULL DEFAULT '件' COMMENT '计量单位',
  `barcode`                 VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '条码',
  `sale_price`              DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '销售单价(元)',
  `cost_price`              DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '参考成本单价(元)',
  `current_stock`           DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '当前库存(由程序计算维护)',
  `stock_warning_threshold` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '库存预警阈值',
  `status`                  TINYINT      NOT NULL DEFAULT 1 COMMENT '状态:1上架 0下架',
  `create_time`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_sku` (`tenant_id`, `sku_code`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表';
 
-- 4. 进货单表
CREATE TABLE `purchase_order` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`     BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `order_no`      VARCHAR(32)  NOT NULL COMMENT '进货单号',
  `supplier_name` VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '供应商名称',
  `total_amount`  DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '进货总额(程序计算)',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '状态:1草稿 2已入库 3已作废',
  `purchase_time` DATETIME     NULL COMMENT '进货时间',
  `remark`        VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_order_no` (`tenant_id`, `order_no`),
  KEY `idx_tenant_purchase_time` (`tenant_id`, `purchase_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='进货单表';
 
-- 5. 进货单明细表
CREATE TABLE `purchase_order_item` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`         BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `purchase_order_id` BIGINT UNSIGNED NOT NULL COMMENT '进货单ID',
  `product_id`        BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `quantity`          DECIMAL(12,2) NOT NULL COMMENT '进货数量',
  `unit_cost`         DECIMAL(12,2) NOT NULL COMMENT '进货单价(元)',
  `amount`            DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '小计金额(程序计算)',
  `create_time`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_order` (`tenant_id`, `purchase_order_id`),
  KEY `idx_tenant_product` (`tenant_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='进货单明细表';
 
-- 6. 销售单表
CREATE TABLE `sales_order` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`     BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `order_no`      VARCHAR(32)  NOT NULL COMMENT '销售单号',
  `customer_name` VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '客户名称(散客可为空)',
  `total_amount`  DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '销售总额(程序计算)',
  `total_cost`    DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '销售总成本(程序计算,按成本快照)',
  `gross_profit`  DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '毛利(程序计算=总额-成本)',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '状态:1正常 2已退款 3已作废',
  `sales_time`    DATETIME     NULL COMMENT '销售时间',
  `remark`        VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_order_no` (`tenant_id`, `order_no`),
  KEY `idx_tenant_sales_time` (`tenant_id`, `sales_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售单表';
 
-- 7. 销售单明细表
CREATE TABLE `sales_order_item` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`      BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `sales_order_id` BIGINT UNSIGNED NOT NULL COMMENT '销售单ID',
  `product_id`     BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `quantity`       DECIMAL(12,2) NOT NULL COMMENT '销售数量',
  `unit_price`     DECIMAL(12,2) NOT NULL COMMENT '销售单价(元)',
  `unit_cost`      DECIMAL(12,2) NOT NULL COMMENT '当时成本单价(元,快照,程序算毛利用)',
  `amount`         DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '金额小计(程序计算)',
  `cost_amount`    DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '成本小计(程序计算)',
  `profit`         DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '毛利小计(程序计算)',
  `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_order` (`tenant_id`, `sales_order_id`),
  KEY `idx_tenant_product` (`tenant_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售单明细表';
 
-- 8. 开销记录表
CREATE TABLE `expense` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`      BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `expense_type`   VARCHAR(32)  NOT NULL COMMENT '开销类型:rent房租 utility水电 salary人工 marketing营销 other其他',
  `amount`         DECIMAL(14,2) NOT NULL COMMENT '开销金额(元)',
  `expense_time`   DATETIME     NOT NULL COMMENT '发生时间',
  `payee`          VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '收款方/收款说明',
  `payment_method` VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '支付方式:cash现金 wechat微信 alipay支付宝 bank银行卡',
  `remark`         VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_expense_time` (`tenant_id`, `expense_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='开销记录表';
 
-- 9. 库存流水表(库存由程序计算,流水用于追溯与重算)
--    change_type 统一使用字符串标识,便于扩展:init期初入库 purchase进货入库 sales销售出库 check盘点调整 return退货入库 other其他
CREATE TABLE `inventory_log` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`       BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `product_id`      BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `change_type`     VARCHAR(20)  NOT NULL COMMENT '变动类型:init期初入库 purchase进货入库 sales销售出库 check盘点调整 return退货入库 other其他',
  `change_quantity` DECIMAL(12,2) NOT NULL COMMENT '变动数量(入库为正,出库为负)',
  `before_stock`    DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '变动前库存(程序计算)',
  `after_stock`     DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '变动后库存(程序计算)',
  `ref_type`        VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '关联单据类型:init期初 purchase进货 sales销售 adjust盘点',
  `ref_id`          BIGINT UNSIGNED NULL COMMENT '关联单据ID',
  `remark`          VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注(盘点原因等)',
  `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_product` (`tenant_id`, `product_id`),
  KEY `idx_tenant_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存流水表';
 
-- ==================================================================
-- 三、AI 相关表(配额限流 / 调用日志 / 报告分离存储)
-- ==================================================================
 
-- 10. 租户每日AI调用配额表(限流控token)
CREATE TABLE `tenant_ai_quota` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`   BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `quota_date`  DATE        NOT NULL COMMENT '配额日期(按天)',
  `daily_limit` INT         NOT NULL DEFAULT 0 COMMENT '当日AI调用上限',
  `used_count`  INT         NOT NULL DEFAULT 0 COMMENT '当日已调用次数',
  `version`     INT         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号(并发扣减用)',
  `create_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_date` (`tenant_id`, `quota_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户每日AI调用配额表';
 
-- 11. AI调用日志表(token消耗统计)
CREATE TABLE `ai_call_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`         BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `module_type`       VARCHAR(32)  NOT NULL COMMENT 'AI功能类型:inventory库存诊断 profit利润分析 video短视频文案 community社群文案 ip打造 deal获客 plan发展建议',
  `request_summary`   VARCHAR(255) NOT NULL DEFAULT '' COMMENT '请求内容摘要',
  `prompt_tokens`     INT          NOT NULL DEFAULT 0 COMMENT '输入token数',
  `completion_tokens` INT          NOT NULL DEFAULT 0 COMMENT '输出token数',
  `total_tokens`      INT          NOT NULL DEFAULT 0 COMMENT '总token数',
  `status`            TINYINT      NOT NULL DEFAULT 1 COMMENT '状态:1成功 2失败 3被限流',
  `report_id`         BIGINT UNSIGNED NULL COMMENT '关联AI报告ID',
  `error_msg`         VARCHAR(255) NOT NULL DEFAULT '' COMMENT '失败原因',
  `create_time`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_module` (`tenant_id`, `module_type`),
  KEY `idx_tenant_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI调用日志表';
 
-- 12. AI报告表(与原始业务单据分离存储)
CREATE TABLE `ai_report` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`   BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `report_type` VARCHAR(32)  NOT NULL COMMENT '报告类型:inventory/profit/video/community/ip/deal/plan',
  `title`       VARCHAR(128) NOT NULL COMMENT '报告标题',
  `content`     LONGTEXT     NULL COMMENT '报告内容(与原始单据分离,仅此处存储)',
  `source_type` VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '来源单类型(可空):purchase/sales/none',
  `source_id`   BIGINT UNSIGNED NULL COMMENT '来源单ID(弱引用,不参与业务计算)',
  `token_used`  INT          NOT NULL DEFAULT 0 COMMENT '本次消耗token数',
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '生成状态:1生成中 2成功 3失败',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_type` (`tenant_id`, `report_type`),
  KEY `idx_tenant_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI报告表';
 
-- ==================================================================
-- 四、RBAC 权限表
-- ==================================================================
 
-- 13. 角色表(系统预置 + 租户自定义)
CREATE TABLE `role` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`   BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '租户ID;0为系统预置全局角色,否则为租户自定义角色',
  `role_code`   VARCHAR(32)  NOT NULL COMMENT '角色编码:owner店主 staff店员 analyst运营',
  `role_name`   VARCHAR(32)  NOT NULL COMMENT '角色名称',
  `is_system`   TINYINT      NOT NULL DEFAULT 0 COMMENT '是否系统预置:1是 0否(自定义不可删除)',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_role_code` (`tenant_id`, `role_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';
 
-- 14. 权限点表(系统级全局字典,非业务表故无需 tenant_id)
CREATE TABLE `permission` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `perm_code`   VARCHAR(64)  NOT NULL COMMENT '权限编码,如 product:write sale:read ai:call quota:manage',
  `perm_name`   VARCHAR(64)  NOT NULL COMMENT '权限名称',
  `module`      VARCHAR(32)  NOT NULL COMMENT '所属模块:product/sale/purchase/expense/stock/ai/user',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_perm_code` (`perm_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限点表';
 
-- 15. 角色-权限关联表(直接冗余 perm_code,少一次联查)
CREATE TABLE `role_permission` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `role_id`     BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  `perm_code`   VARCHAR(64)  NOT NULL COMMENT '权限编码(冗余自permission.perm_code)',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_perm` (`role_id`, `perm_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限关联表';
 
-- 16. 用户-角色关联表(业务表,带 tenant_id)
CREATE TABLE `tenant_user_role` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`   BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `user_id`     BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `role_id`     BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`tenant_id`, `user_id`, `role_id`),
  KEY `idx_user` (`tenant_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';
 
-- ==================================================================
-- 五、初始化数据(角色 / 权限点 / 角色权限绑定)  幂等,可重复执行
-- ==================================================================
 
-- 5.1 预置角色(owner 店主 / staff 店员,tenant_id=0 表示系统全局)
INSERT INTO `role` (`id`, `tenant_id`, `role_code`, `role_name`, `is_system`) VALUES
(1, 0, 'owner', '店主', 1),
(2, 0, 'staff', '店员', 1)
ON DUPLICATE KEY UPDATE `role_name` = VALUES(`role_name`), `is_system` = VALUES(`is_system`);
 
-- 5.2 权限点(共16项)
INSERT INTO `permission` (`id`, `perm_code`, `perm_name`, `module`) VALUES
(1,  'product:read',     '商品查看',     'product'),
(2,  'product:write',    '商品维护',     'product'),
(3,  'purchase:read',    '进货查看',     'purchase'),
(4,  'purchase:write',   '进货制单',     'purchase'),
(5,  'purchase:approve', '进货入库确认', 'purchase'),
(6,  'sale:read',        '销售查看',     'sale'),
(7,  'sale:write',       '销售开单',     'sale'),
(8,  'expense:read',     '开销查看',     'expense'),
(9,  'expense:write',    '开销记账',     'expense'),
(10, 'stock:read',       '库存查看',     'stock'),
(11, 'stock:adjust',     '库存盘点调整', 'stock'),
(12, 'user:manage',      '员工账号管理', 'user'),
(13, 'ai:call',          'AI调用',       'ai'),
(14, 'quota:manage',     '配额管理',     'ai'),
(15, 'report:read',      '报告查看',     'ai'),
(16, 'report:delete',    '报告删除',     'ai')
ON DUPLICATE KEY UPDATE `perm_name` = VALUES(`perm_name`), `module` = VALUES(`module`);
 
-- 5.3 owner 授予全部权限
INSERT INTO `role_permission` (`role_id`, `perm_code`) VALUES
(1, 'product:read'),     (1, 'product:write'),
(1, 'purchase:read'),    (1, 'purchase:write'),    (1, 'purchase:approve'),
(1, 'sale:read'),        (1, 'sale:write'),
(1, 'expense:read'),     (1, 'expense:write'),
(1, 'stock:read'),       (1, 'stock:adjust'),
(1, 'user:manage'),
(1, 'ai:call'),          (1, 'quota:manage'),
(1, 'report:read'),      (1, 'report:delete')
ON DUPLICATE KEY UPDATE `perm_code` = VALUES(`perm_code`);
 
-- 5.4 staff 授予有限权限(不含入库确认/盘点调整/用户管理/配额管理/报告删除)
INSERT INTO `role_permission` (`role_id`, `perm_code`) VALUES
(2, 'product:read'),   (2, 'product:write'),
(2, 'purchase:read'),  (2, 'purchase:write'),
(2, 'sale:read'),      (2, 'sale:write'),
(2, 'expense:read'),   (2, 'expense:write'),
(2, 'stock:read'),
(2, 'ai:call'),
(2, 'report:read')
ON DUPLICATE KEY UPDATE `perm_code` = VALUES(`perm_code`);