// 建表脚本：node src/migrate.js
const db = require('./config/db');
const fs = require('fs');
const sql = fs.readFileSync('./migrate_video.sql', 'utf8');
db.query(sql).then(([r]) => {
  console.log('✅ ai_video_task ready');
  process.exit(0);
}).catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
