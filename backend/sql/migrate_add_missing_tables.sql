-- 补充缺失的表结构（AI Agent 功能所需）

CREATE TABLE IF NOT EXISTS `tenant_shop_memory` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `memory_type` VARCHAR(50) NOT NULL DEFAULT 'ai_summary',
  `memory_content` TEXT NOT NULL,
  `memory_source` VARCHAR(50) NOT NULL DEFAULT 'user_chat',
  `importance` DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ai_agent_task_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `task_id` VARCHAR(64) NOT NULL DEFAULT '',
  `user_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `agent_name` VARCHAR(64) NOT NULL DEFAULT '',
  `input_params` TEXT,
  `agent_output` LONGTEXT,
  `status` VARCHAR(20) NOT NULL DEFAULT 'success',
  `input_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
  `output_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
  `total_cost` DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_id` (`task_id`),
  KEY `idx_tenant_agent` (`tenant_id`, `agent_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ai_product_video_record` (
  `task_id` VARCHAR(64) NOT NULL,
  `tenant_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `product_images` TEXT,
  `product_name` VARCHAR(255) DEFAULT '',
  `category` VARCHAR(100) DEFAULT '',
  `core_selling` TEXT,
  `fit_crowd` VARCHAR(255) DEFAULT '',
  `usage_scene` VARCHAR(255) DEFAULT '',
  `short_video_script` TEXT,
  `video_title` VARCHAR(255) DEFAULT '',
  `hash_tag` VARCHAR(500) DEFAULT '',
  `template_key` VARCHAR(64) DEFAULT '',
  `duration` INT UNSIGNED DEFAULT 15,
  `video_path` VARCHAR(500) DEFAULT '',
  `video_blob` LONGBLOB,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `error_msg` TEXT,
  `video_source` VARCHAR(20) DEFAULT 'local',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `expense` ADD COLUMN `deleted` TINYINT(1) NOT NULL DEFAULT 0;
