// 全链路日志: winston + daily rotate file
// info.log / error.log 按天滚动, 保留 7 天
// 控制台同步输出便于开发调试
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

const { combine, timestamp, printf, colorize } = format;

const myFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `${timestamp} [${level}] ${message}${metaStr}`;
});

// 按天滚动文件 transport
const dailyRotateFile = (filename, level) => new transports.DailyRotateFile({
  filename: path.join(logDir, filename),
  datePattern: 'YYYY-MM-DD',
  level,
  maxSize: '20m',
  maxFiles: '7d',
  zippedArchive: true,
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), myFormat),
  transports: [
    dailyRotateFile('info.log', 'info'),
    dailyRotateFile('error.log', 'error'),
  ],
});

// 开发环境额外输出控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({ format: combine(colorize(), myFormat) }));
}

module.exports = { logger };
