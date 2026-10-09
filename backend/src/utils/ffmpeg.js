// ffmpeg 封装
const { spawn } = require('child_process');
const path = require('path');

// ffmpeg 在 tools 目录下（便携版）
const FFMPEG_DIR = path.resolve(__dirname, '../../tools/ffmpeg-9.0.1-essentials_build/bin');
const FFMPEG = path.join(FFMPEG_DIR, 'ffmpeg.exe');
const FFPROBE = path.join(FFMPEG_DIR, 'ffprobe.exe');

/**
 * 执行 ffmpeg 命令
 * @param {string[]} args 参数数组
 * @param {number} timeoutMs 超时毫秒
 */
function run(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit=${code}: ${stderr.slice(-500)}`));
    });
    // 超时保护
    const timer = setTimeout(() => { proc.kill(); reject(new Error('ffmpeg timeout')); }, timeoutMs);
    proc.on('close', () => clearTimeout(timer));
  });
}

/**
 * 获取音频时长（秒）
 */
async function getDuration(input) {
  return new Promise((resolve, reject) => {
    const isBuffer = Buffer.isBuffer(input);
    const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1'];
    if (isBuffer) args.push('-i', 'pipe:0'); else args.push(input);
    const proc = spawn(FFPROBE, args, isBuffer ? { stdio: ['pipe', 'pipe', 'pipe'] } : undefined);
    if (isBuffer) { proc.stdin.end(input); }
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    let err = ''; proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', c => {
      if (c === 0) resolve(parseFloat(out));
      else reject(new Error('ffprobe fail: ' + err.slice(-300)));
    });
  });
}


// ? WAV Buffer ?????????? ffprobe stdin pipe ? EOF ??
function getWavDuration(buf) {
  if (!buf || buf.length < 44) return 0;
  const sampleRate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
  const bitsPerSample = buf.readUInt16LE(34);
  let dataSize = 0;
  let offset = 36;
  while (offset < buf.length - 8) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'data') { dataSize = chunkSize; break; }
    offset += 8 + chunkSize;
  }
  if (!dataSize || !sampleRate) return 0;
  return dataSize / (sampleRate * channels * bitsPerSample / 8);
}

// ?? ffmpeg ??? stdout??? pipe:1 ????? Node ?????????
function runCapture(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error('ffmpeg exit=' + code + ': ' + stderr.slice(-500)));
    });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('ffmpeg timeout')); }, timeoutMs);
    proc.on('close', () => clearTimeout(timer));
  });
}
module.exports = { run, runCapture, getDuration, getWavDuration, FFMPEG, FFPROBE };
