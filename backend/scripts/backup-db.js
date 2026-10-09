// 数据库定时自动备份
// 每天 03:00 执行 mysqldump + gzip, 保留最近 7 天滚动覆盖
// 依赖: node-cron (需在 server.js 启动时 require 本文件注册到同进程)
const cron = require('node-cron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
const DB = process.env.DB_NAME || 'ai_store_saas';
const USER = process.env.DB_USER || 'root';
const PASS = process.env.DB_PASSWORD || '';
const HOST = process.env.DB_HOST || '127.0.0.1';
const PORT = process.env.DB_PORT || '3306';

// Linux 环境 7 天清理, Windows 环境跳过 find 命令
const isWin = process.platform === 'win32';

function runBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
    catch (e) { console.error('[Backup] 创建备份目录失败:', e.message); return; }
  }
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(BACKUP_DIR, `db_${date}.sql.gz`);
  // mysqldump 输出通过管道 gzip 压缩
  const cmd = isWin
    ? `mysqldump -h${HOST} -P${PORT} -u${USER} -p${PASS} ${DB} > "${file.replace(/\.gz$/, '')}"`
    : `mysqldump -h${HOST} -P${PORT} -u${USER} -p${PASS} ${DB} | gzip > "${file}"`;

  exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err) => {
    if (err) { console.error('[Backup] 失败:', err.message); return; }
    console.log('[Backup] 完成:', file);
    // 滚动清理 7 天前的备份
    if (!isWin) {
      exec(`find "${BACKUP_DIR}" -name "db_*.sql.gz" -mtime +7 -delete`, (e2) => {
        if (e2) console.error('[Backup] 清理旧备份失败:', e2.message);
      });
    } else {
      // Windows: 遍历删除 7 天前的文件
      try {
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        for (const f of fs.readdirSync(BACKUP_DIR)) {
          if (!/^db_.*\.sql(\.gz)?$/.test(f)) continue;
          const full = path.join(BACKUP_DIR, f);
          if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
        }
      } catch (e2) { console.error('[Backup] 清理旧备份失败:', e2.message); }
    }
  });
}

// 注册定时任务: 每天 03:00
cron.schedule('0 3 * * *', () => {
  console.log('[Backup] 开始执行定时备份...');
  runBackup();
});

console.log('[Backup] 定时任务已注册: 每天 03:00 执行数据库备份, 目录:', BACKUP_DIR);

// 导出供测试手动触发
module.exports = { runBackup };
