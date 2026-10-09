-- ============================================================
-- 通用业务操作审计日志表 operation_log
-- 记录 谁/何时/做了什么操作, 按租户独立保存
-- ============================================================
USE `ai_store_saas`;

CREATE TABLE IF NOT EXISTS `operation_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`   BIGINT          NOT NULL COMMENT '租户ID',
  `user_id`     BIGINT          DEFAULT NULL COMMENT '操作用户ID',
  `username`    VARCHAR(64)     DEFAULT NULL COMMENT '用户名',
  `method`      VARCHAR(10)     NOT NULL COMMENT 'HTTP方法',
  `path`        VARCHAR(255)    NOT NULL COMMENT '请求路径',
  `perm_code`   VARCHAR(64)     DEFAULT NULL COMMENT '权限码',
  `status_code` INT             DEFAULT NULL COMMENT '响应状态码',
  `duration_ms` INT             DEFAULT NULL COMMENT '耗时毫秒',
  `ip`          VARCHAR(45)     DEFAULT NULL COMMENT '客户端IP',
  `create_time` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  INDEX `idx_tenant_time` (`tenant_id`, `create_time`),
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务操作审计日志';
