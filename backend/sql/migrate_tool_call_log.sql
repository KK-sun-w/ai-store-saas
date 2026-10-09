-- ============================================================
-- Agent 工具调用审计日志表 ai_tool_call_log
-- 记录每次工具调用的输入/输出/状态/耗时/权限校验结果
-- ============================================================
USE `ai_store_saas`;

CREATE TABLE IF NOT EXISTS `ai_tool_call_log` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`     BIGINT          NOT NULL COMMENT '租户ID',
  `task_id`       VARCHAR(64)     NOT NULL COMMENT 'Agent任务ID',
  `tool_name`     VARCHAR(64)     NOT NULL COMMENT '工具名称',
  `input_args`    TEXT            DEFAULT NULL COMMENT '输入参数JSON',
  `output_result` TEXT            DEFAULT NULL COMMENT '输出结果(截断8000字符)',
  `status`        VARCHAR(20)     NOT NULL DEFAULT 'success' COMMENT 'success/failed/blocked',
  `duration_ms`   INT             DEFAULT NULL COMMENT '执行耗时毫秒',
  `error_msg`     VARCHAR(500)    DEFAULT NULL COMMENT '错误信息',
  `create_time`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '调用时间',
  PRIMARY KEY (`id`),
  INDEX `idx_tenant_task` (`tenant_id`, `task_id`),
  INDEX `idx_tenant_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent工具调用审计日志';
