-- ============================================================
-- 即梦数字人形象表 + 视频任务表扩展字段
-- ============================================================
USE `ai_store_saas`;

-- 数字人形象库: 一个租户可创建多个数字人形象
CREATE TABLE IF NOT EXISTS `ai_digital_human` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`   BIGINT          NOT NULL COMMENT '租户ID',
  `name`        VARCHAR(64)     NOT NULL COMMENT '形象名称',
  `image_url`   VARCHAR(512)   NOT NULL COMMENT '人像图片URL(经Nginx HTTPS反代可被即梦访问)',
  `description` VARCHAR(255)    DEFAULT NULL COMMENT '形象描述',
  `status`      TINYINT         NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_name` (`tenant_id`, `name`),
  INDEX `idx_tenant_status` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数字人形象库';

-- ai_video_task 扩展: 数字人ID / 即梦任务ID / 生成方式
-- 使用 ADD COLUMN IF NOT EXISTS 兼容已存在表(MySQL 8.0 不支持 IF NOT EXISTS on column,
-- 这里用存储过程做幂等迁移)
DROP PROCEDURE IF EXISTS `migrate_video_task_cols`;
DELIMITER $$
CREATE PROCEDURE `migrate_video_task_cols`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_video_task'
                   AND COLUMN_NAME = 'digital_human_id') THEN
    ALTER TABLE `ai_video_task` ADD COLUMN `digital_human_id` BIGINT DEFAULT NULL COMMENT '数字人ID(关联ai_digital_human.id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_video_task'
                   AND COLUMN_NAME = 'jimeng_task_id') THEN
    ALTER TABLE `ai_video_task` ADD COLUMN `jimeng_task_id` VARCHAR(64) DEFAULT NULL COMMENT '即梦API返回的task_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_video_task'
                   AND COLUMN_NAME = 'provider') THEN
    ALTER TABLE `ai_video_task` ADD COLUMN `provider` VARCHAR(20) NOT NULL DEFAULT 'local' COMMENT '生成方式 local/jimeng';
  END IF;
END$$
DELIMITER ;
CALL `migrate_video_task_cols`();
DROP PROCEDURE IF EXISTS `migrate_video_task_cols`;
