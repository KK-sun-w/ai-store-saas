-- ============================================================
-- 店铺长期记忆模块 建表SQL
-- 包含: tenant_shop_memory(长期记忆) + ai_chat_log_archive(原始聊天归档)
-- 适用: MySQL 8.x   字符集: utf8mb4
-- 执行: mysql -u root -p ai_store_saas < migrate_shop_memory.sql
-- ============================================================
SET NAMES utf8mb4;
USE `ai_store_saas`;

-- ==================================================================
-- 一、店铺长期记忆表 -- 跨会话、跨浏览器持久化店铺知识
-- 只存结构化提炼后的信息,不存原始聊天文本
-- AI Agent 做店铺分析时优先查 importance 高的记忆,送入 prompt
-- ==================================================================
CREATE TABLE IF NOT EXISTS `tenant_shop_memory` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键自增',
  `tenant_id`      BIGINT UNSIGNED NOT NULL COMMENT '租户ID(多租户隔离,来自JWT)',
  `memory_type`    VARCHAR(32)     NOT NULL COMMENT '记忆类型: sales_data销售数据 / user_decision用户决策 / shop_attr店铺基础属性 / ai_summary AI总结',
  `memory_content` JSON            NOT NULL COMMENT '结构化记忆内容(JSON),不存原始大段聊天文本',
  `memory_source`  VARCHAR(32)     NOT NULL DEFAULT 'user_chat' COMMENT '数据来源: business_data进销存业务数据 / user_chat用户对话 / agent_log Agent执行记录',
  `importance`     DECIMAL(4,1)    NOT NULL DEFAULT 5.0 COMMENT '权重0-10,权重越高AI优先参考该条记忆',
  `create_time`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_importance` (`tenant_id`, `importance` DESC),
  KEY `idx_tenant_type` (`tenant_id`, `memory_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='店铺长期记忆表(跨会话持久化)';

-- ==================================================================
-- 二、原始聊天日志归档表 -- 仅归档存档,不参与AI推理
-- 与 tenant_shop_memory 分离:记忆表存提炼后的结构化知识,
-- 此表存完整聊天原文,仅供审计/回溯,不送入LLM prompt
-- ==================================================================
CREATE TABLE IF NOT EXISTS `ai_chat_log_archive` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键自增',
  `tenant_id`      BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  `session_id`     VARCHAR(64)     NOT NULL DEFAULT '' COMMENT '会话ID(同一次对话流程)',
  `role`           VARCHAR(16)     NOT NULL COMMENT '角色: user用户 / assistant AI / system系统',
  `content`        LONGTEXT        NOT NULL COMMENT '原始消息全文(仅归档,不参与AI推理)',
  `meta_info`      JSON            DEFAULT NULL COMMENT '附加元信息: token数/模型名/耗时等',
  `create_time`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_session` (`tenant_id`, `session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='原始聊天日志归档表(仅审计,不参与AI推理)';
