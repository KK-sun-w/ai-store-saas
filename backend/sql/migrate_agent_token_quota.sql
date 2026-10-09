-- ============================================================
-- Agent Token 配额体系迁移脚本
-- 1. ai_quota: 每个租户的 Agent Token 总额度与已用额度
-- 2. ai_token_bill: Token 消耗流水(永久保存, 用于对账)
-- 默认新租户赠送 50 万 Token 用于体验
-- ============================================================

-- 1. Agent Token 配额表(按租户, 不按日期)
CREATE TABLE IF NOT EXISTS `ai_quota` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`          BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `agent_token_total`  BIGINT       NOT NULL DEFAULT 0 COMMENT 'Agent总Token额度(0=不限量)',
  `agent_token_used`   BIGINT       NOT NULL DEFAULT 0 COMMENT 'Agent已使用Token',
  `create_time`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent Token配额表(按租户)';

-- 2. Token 消耗流水表(永久保存, 用于成本对账)
CREATE TABLE IF NOT EXISTS `ai_token_bill` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`         BIGINT UNSIGNED NOT NULL COMMENT '租户ID(数据隔离)',
  `user_id`           BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '操作用户ID',
  `prompt_tokens`     INT          NOT NULL DEFAULT 0 COMMENT '输入token数',
  `completion_tokens` INT          NOT NULL DEFAULT 0 COMMENT '输出token数',
  `total_tokens`      INT          NOT NULL DEFAULT 0 COMMENT '总token数(prompt+completion)',
  `scene`             VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '消耗场景:store_business/mentor/video/marketing/reflection等',
  `remark`            VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_time` (`tenant_id`, `create_time`),
  KEY `idx_tenant_scene` (`tenant_id`, `scene`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Token消耗流水表(永久保存)';

-- 3. 为已有租户初始化配额(默认赠送50万Token)
INSERT IGNORE INTO `ai_quota` (tenant_id, agent_token_total, agent_token_used)
SELECT id, 500000, 0 FROM tenant WHERE id > 0;
