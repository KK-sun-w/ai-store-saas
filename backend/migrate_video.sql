-- AI 短视频成片生成任务表
CREATE TABLE IF NOT EXISTS `ai_video_task` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `task_id` VARCHAR(40) NOT NULL UNIQUE COMMENT '任务唯一ID',
  `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
  `reference_url` VARCHAR(500) DEFAULT '' COMMENT '参考作品链接',
  `avatar_desc` VARCHAR(500) DEFAULT '' COMMENT '本人形象描述',
  `template_key` VARCHAR(50) DEFAULT 'boss_talk' COMMENT '模板标识',
  `duration` INT DEFAULT 30 COMMENT '时长（秒）',
  `script_text` TEXT COMMENT 'AI 生成的脚本/口播全文',
  `audio_path` VARCHAR(255) DEFAULT '' COMMENT 'TTS 音频路径',
  `video_path` VARCHAR(255) DEFAULT '' COMMENT '最终视频路径',
  `status` VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/generating_script/tts_generating/video_compositing/success/failed',
  `error_msg` VARCHAR(1000) DEFAULT '' COMMENT '错误信息',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI短视频生成任务';
