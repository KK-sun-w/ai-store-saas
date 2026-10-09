// 即梦 AI 视频 API 对接(火山引擎视觉服务)
// 提交数字人视频生成任务 → 轮询结果 → 下载视频
// 依赖: axios, 环境变量 VOLC_AK/VOLC_SK/JIMENG_REQ_KEY
// 降级策略: 任一步失败返回 { fallback: true }, 由 videoGenerate.service 走原 ffmpeg 流程
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const { sign } = require('./jimengSign');

const AK = process.env.VOLC_AK;
const SK = process.env.VOLC_SK;
const REQ_KEY = process.env.JIMENG_REQ_KEY || 'jimeng_realman_avatar_picture_omni_v15';
const HOST = 'visual.volcengineapi.com';

/**
 * 构造签名后的请求 headers
 */
function signedHeaders(method, query, body) {
  const s = sign({ method, host: HOST, path: '/', query, body, ak: AK, sk: SK });
  return { ...s.headers, 'Content-Type': 'application/json' };
}

/**
 * 提交即梦视频生成任务
 * @param {object} p
 * @param {string} p.imageUrl 数字人人像图片 URL(需公网可访问)
 * @param {string} p.audioUrl 口播音频 URL(需公网可访问)
 * @param {string} p.prompt 口播文案/脚本提示
 * @param {number} p.resolution 输出分辨率 720/1080
 * @returns {Promise<string|null>} task_id, 失败返回 null(降级)
 */
async function submitVideoTask({ imageUrl, audioUrl, prompt, resolution = 720 }) {
  if (!AK || !SK) {
    logger.error('[Jimeng] 未配置 VOLC_AK/VOLC_SK, 无法调用即梦, 降级本地合成');
    return null;
  }
  const query = { Action: 'CVSubmitTask', Version: '2022-08-31' };
  const bodyObj = {
    req_key: REQ_KEY,
    image_url: imageUrl,
    audio_url: audioUrl,
    prompt: prompt || '',
    output_resolution: String(resolution),
    pe_fast_mode: true,
  };
  const body = JSON.stringify(bodyObj);
  try {
    const headers = signedHeaders('POST', query, body);
    const res = await axios.post(`https://${HOST}/`, body, {
      params: query,
      headers,
      timeout: 30000,
    });
    const data = res.data;
    if (data.code === 10000 && data.data && data.data.task_id) {
      logger.info('[Jimeng] 任务提交成功, task_id:', data.data.task_id);
      return data.data.task_id;
    }
    logger.error('[Jimeng] 提交失败', JSON.stringify(data));
    return null;
  } catch (e) {
    logger.error('[Jimeng] 提交异常', e.message);
    return null;
  }
}

/**
 * 查询单次任务结果
 * @param {string} taskId
 * @returns {Promise<object|null>} { status, video_url } 或 null
 */
async function queryResult(taskId) {
  const query = { Action: 'CVGetResult', Version: '2022-08-31' };
  const body = JSON.stringify({ req_key: REQ_KEY, task_id: taskId });
  try {
    const headers = signedHeaders('POST', query, body);
    const res = await axios.post(`https://${HOST}/`, body, {
      params: query,
      headers,
      timeout: 30000,
    });
    const data = res.data;
    if (data.code !== 10000) return { status: 'failed', video_url: null };
    // resp_data.status: 0 处理中, 1 成功, 2 失败
    const status = data.data?.resp_data?.status;
    const videoUrl = data.data?.resp_data?.video_url;
    if (status === 1 && videoUrl) return { status: 'success', video_url: videoUrl };
    if (status === 2) return { status: 'failed', video_url: null };
    return { status: 'pending', video_url: null };
  } catch (e) {
    logger.error('[Jimeng] 查询异常', e.message);
    return null;
  }
}

/**
 * 轮询任务直到完成或超时
 * @param {string} taskId
 * @param {number} maxRetry 最大轮询次数(默认 60)
 * @param {number} interval 轮询间隔毫秒(默认 5000)
 * @returns {Promise<{videoUrl: string}|null>} 成功返回视频 URL, 失败返回 null
 */
async function pollResult(taskId, maxRetry = 60, interval = 5000) {
  for (let i = 0; i < maxRetry; i++) {
    const r = await queryResult(taskId);
    if (r?.status === 'success' && r.video_url) {
      return { videoUrl: r.video_url };
    }
    if (r?.status === 'failed') {
      logger.error('[Jimeng] 任务失败, task_id:', taskId);
      return null;
    }
    // pending: 等待后继续
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  logger.error('[Jimeng] 轮询超时, task_id:', taskId);
  return null;
}

/**
 * 下载视频到本地
 * @param {string} url 视频下载地址
 * @param {string} outPath 本地保存路径
 * @returns {Promise<boolean>} 成功 true
 */
async function downloadVideo(url, outPath) {
  try {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const resp = await axios.get(url, { responseType: 'stream', timeout: 120000 });
    const ws = fs.createWriteStream(outPath);
    await new Promise((resolve, reject) => {
      resp.data.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    return true;
  } catch (e) {
    logger.error('[Jimeng] 下载视频失败', e.message);
    return false;
  }
}

module.exports = { submitVideoTask, pollResult, downloadVideo, queryResult };
