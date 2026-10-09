// AI 短视频成片生成流水线
// 异步执行：生成脚本 → TTS → ffmpeg 合成 MP4
// 企业级升级: 新增 jimeng provider 分支, 对接即梦数字人 API, 失败自动降级本地合成
const fs = require('fs');
const path = require('path');
const { callLlm } = require('../../utils/llm');
const ffmpeg = require('../utils/ffmpeg');
const tts = require('../utils/tts');
const db = require('../config/db');
const { logger } = require('../utils/logger');
const jimeng = require('./jimengApi.service');

// 输出目录
const OUT_DIR = path.resolve(__dirname, '../../videos_out');
const TMP_DIR = path.resolve(__dirname, '../../videos_out/tmp');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// 模板配置
const TEMPLATES = {
  boss_talk: { name: '老板口播风', bgColor: '#1a1a2e', accent: '#e94560', style: '口播' },
  product_show: { name: '商品展示带货风', bgColor: '#0f3460', accent: '#e94560', style: '展示' },
  store_traffic: { name: '门店实拍引流风', bgColor: '#16213e', accent: '#0f9b8e', style: '门店' },
  story_reverse: { name: '剧情反转风', bgColor: '#2d132c', accent: '#ff6b6b', style: '剧情' },
  knowledge: { name: '知识讲解风', bgColor: '#1b262c', accent: '#3282b8', style: '讲解' },
};

/**
 * 生成唯一任务 ID
 */
function genTaskId() {
  return 'VDO_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * 保存任务到数据库(支持 digital_human_id / provider 扩展字段)
 */
async function saveTask(task) {
  const sql = `INSERT INTO ai_video_task
    (task_id, tenant_id, reference_url, avatar_desc, template_key, duration,
     script_text, audio_path, video_path, status, error_msg,
     digital_human_id, jimeng_task_id, provider, create_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`;
  await db.query(sql, [
    task.taskId, task.tenantId, task.referenceUrl || '', task.avatarDesc || '',
    task.templateKey, task.duration, task.script || '', task.audioPath || '',
    task.videoUrl || '', task.status, task.errorMsg || '',
    task.digitalHumanId || null, task.jimengTaskId || null, task.provider || 'local',
  ]);
}

/**
 * 更新任务状态
 */
async function updateTask(taskId, status, patch = {}) {
  const sets = ['status = ?'];
  const vals = [status];
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(taskId);
  await db.query(`UPDATE ai_video_task SET ${sets.join(', ')} WHERE task_id = ?`, vals);
}

/**
 * AI 生成视频脚本（分镜 + 口播）
 */
async function generateScript(userInput, template, avatarDesc, durationSec) {
  const templateName = TEMPLATES[template]?.name || '老板口播风';
  const sec = durationSec || 30;
  const prompt = `你是抖音短视频编剧。请根据以下需求生成一个 **${sec}秒** 口播短视频脚本。

【用户输入】${userInput}
【人物形象】${avatarDesc || '中年男性店主，站在门店货架前自然口播'}
【模板风格】${templateName}

请输出纯 JSON（不要 markdown，不要多余文字），格式：
{
  "hook": "0-3秒钩子台词（制造好奇）",
  "scenes": [
    {"time": "3-8秒", "visual": "画面描述", "speech": "口播台词"},
    {"time": "8-15秒", "visual": "画面描述", "speech": "口播台词"},
    {"time": "15-22秒", "visual": "画面描述", "speech": "口播台词"},
    {"time": "22-${sec}秒", "visual": "画面描述", "speech": "行动指令"}
  ],
  "cta": "结尾行动指令（到店/关注/下单）"
}

总台词量控制在 ${sec*3} 字左右（语速约 3 字/秒）。`;

  const raw = await callLlm('', prompt);
  // 提取 JSON
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI 返回格式异常');
  const json = JSON.parse(m[0]);
  // 拼完整口播
  const allSpeech = [json.hook, ...json.scenes.map(s => s.speech), json.cta]
    .filter(Boolean).join('。');
  return { json, speech: allSpeech, scenes: json.scenes || [] };
}

/**
 * 生成纯色渐变视频（用作画面层）
 */
async function generateBackgroundVideo(outPath, duration, width = 1080, height = 1920, bgColor = '#1a1a2e', accent = '#e94560') {
  // hsl 渐变 + 微妙运动
  await ffmpeg.run([
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${bgColor}:s=${width}x${height}:d=${duration}:r=30`,
    '-vf', `format=yuv420p,drawbox=x=0:y=${height}-300:w=${width}:h=300:color=${accent}@0.3:t=fill`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    outPath
  ]);
}

/**
 * 即梦 provider 流水线: 数字人图片 + 口播文案 → TTS → 即梦提交 → 轮询 → 下载
 * 失败时返回 { fallback: true } 由主流程走本地 ffmpeg 合成
 */
async function runJimengPipeline(params) {
  const { taskId, tenantId, userInput, digitalHumanId, duration, templateKey, avatarDesc } = params;
  // 1. 查数字人图片 URL
  const [dhRows] = await db.query(
    'SELECT image_url, name FROM ai_digital_human WHERE id = ? AND tenant_id = ? AND status = 1',
    [digitalHumanId, tenantId]
  );
  if (!dhRows.length) throw new Error('数字人形象不存在或已禁用');
  const imageUrl = dhRows[0].image_url;

  await updateTask(taskId, 'generating_script');
  // 2. AI 生成口播文案(限制 < 60 秒)
  const dur = Math.min(duration || 30, 60);
  const script = await generateScript(userInput, templateKey, avatarDesc || dhRows[0].name, dur);
  await updateTask(taskId, 'tts_generating', { script_text: script.speech });

  // 3. TTS 合成音频(即梦需要公网可访问的 audio_url, 这里用本地 TTS 后返回相对路径)
  const tmpAudio = path.join(TMP_DIR, `${taskId}.wav`);
  const voice = avatarDesc?.includes('女') ? 'Microsoft Huihui Desktop' : 'Microsoft Kangkang Desktop';
  await tts.synthesize(script.speech, tmpAudio, { voice });

  // 4. 提交即梦任务(图片+音频+文案)
  // 注意: 即梦要求 imageUrl/audioUrl 公网可访问, 生产环境需经 Nginx HTTPS 反代
  // 这里把本地相对路径拼成服务端可访问 URL
  const publicBase = process.env.PUBLIC_BASE_URL || '';
  const audioUrl = publicBase ? `${publicBase}/videos-out/tmp/${taskId}.wav` : tmpAudio;
  const pubImageUrl = imageUrl.startsWith('http') ? imageUrl : (publicBase ? publicBase + imageUrl : imageUrl);

  await updateTask(taskId, 'video_compositing', { jimeng_task_id: 'submitting' });
  const jimengTaskId = await jimeng.submitVideoTask({
    imageUrl: pubImageUrl,
    audioUrl,
    prompt: script.speech,
    resolution: 720,
  });
  if (!jimengTaskId) {
    // 降级: 走本地 ffmpeg 合成
    logger.warn('[VideoGen] 即梦提交失败, 降级本地合成, taskId:', taskId);
    return { fallback: true, script, tmpAudio };
  }
  await updateTask(taskId, 'video_compositing', { jimeng_task_id: jimengTaskId });

  // 5. 轮询即梦结果
  const result = await jimeng.pollResult(jimengTaskId, 60, 5000);
  if (!result) {
    logger.warn('[VideoGen] 即梦轮询失败/超时, 降级本地合成, taskId:', taskId);
    return { fallback: true, script, tmpAudio };
  }

  // 6. 下载视频到本地
  const outVideo = path.join(OUT_DIR, `${taskId}.mp4`);
  const ok = await jimeng.downloadVideo(result.videoUrl, outVideo);
  if (!ok) {
    return { fallback: true, script, tmpAudio };
  }
  const videoUrl = `/videos-out/${taskId}.mp4`;
  await updateTask(taskId, 'success', { video_path: videoUrl, audio_path: tmpAudio });
  return { taskId, videoUrl };
}

/**
 * 主流水线: 根据 provider 分流
 */
async function runPipeline(params) {
  const { taskId, tenantId, userInput, referenceUrl, avatarDesc, templateKey, duration,
          digitalHumanId, provider } = params;
  const providerMode = provider === 'jimeng' && digitalHumanId ? 'jimeng' : 'local';

  // 即梦分支: 失败自动降级本地
  if (providerMode === 'jimeng') {
    try {
      const r = await runJimengPipeline(params);
      if (!r.fallback) return { taskId, videoUrl: r.videoUrl };
      // 降级: 继续走本地 ffmpeg
      logger.warn('[VideoGen] 即梦降级, 走本地合成, taskId:', taskId);
    } catch (err) {
      logger.error('[VideoGen] 即梦流程异常, 降级本地:', err.message);
    }
  }

  // 本地 ffmpeg 合成分支(原逻辑)
  const outVideo = path.join(OUT_DIR, `${taskId}.mp4`);
  const tmpAudio = path.join(TMP_DIR, `${taskId}.wav`);
  const tmpBg = path.join(TMP_DIR, `${taskId}_bg.mp4`);
  const tmpFinal = path.join(TMP_DIR, `${taskId}_final.mp4`);

  try {
    await updateTask(taskId, 'generating_script');
    // 1️⃣ AI 生成脚本
    const script = await generateScript(userInput, templateKey, avatarDesc, duration);
    await updateTask(taskId, 'tts_generating', { script_text: script.speech });

    // 2️⃣ TTS 生成口播音频
    const voice = avatarDesc?.includes('女') ? 'Microsoft Huihui Desktop' : 'Microsoft Kangkang Desktop';
    await tts.synthesize(script.speech, tmpAudio, { voice });
    const audioDur = await ffmpeg.getDuration(tmpAudio);
    const finalDur = Math.max(audioDur + 1, (duration || 30));
    await updateTask(taskId, 'video_compositing');

    // 3️⃣ 生成背景视频（时长 = 音频时长）
    const tpl = TEMPLATES[templateKey] || TEMPLATES.boss_talk;
    await generateBackgroundVideo(tmpBg, finalDur, 1080, 1920, tpl.bgColor, tpl.accent);

    // 4️⃣ 合成 MP4：背景 + 口播音频
    await ffmpeg.run([
      '-y', '-i', tmpBg, '-i', tmpAudio,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      outVideo
    ], 120000);
    // 5️⃣ 清理临时文件
    try { fs.unlinkSync(tmpAudio); fs.unlinkSync(tmpBg); } catch(e) {}

    const videoUrl = `/videos-out/${taskId}.mp4`;
    await updateTask(taskId, 'success', { video_path: videoUrl, audio_path: tmpAudio });
    return { taskId, videoUrl };
  } catch (err) {
    logger.error('[VideoGen] pipeline error:', err.message);
    await updateTask(taskId, 'failed', { error_msg: String(err.message || err) });
    throw err;
  }
}

function escapeFF(s) {
  if (!s) return '';
  return String(s).replace(/[\\']/g, '\\\\$&').replace(/:/g, '\\:').replace(/,/g, '\\,');
}

/**
 * 异步启动流水线（不阻塞请求）
 * @param {object} params 新增 digitalHumanId / provider
 */
async function startAsync(params) {
  const taskId = genTaskId();
  const tenantId = params.tenantId;
  const provider = params.provider === 'jimeng' ? 'jimeng' : 'local';
  const record = {
    taskId, tenantId,
    referenceUrl: params.referenceUrl,
    avatarDesc: params.avatarDesc,
    templateKey: params.template || 'boss_talk',
    duration: params.duration || 30,
    status: 'pending',
    digitalHumanId: params.digitalHumanId,
    provider,
  };
  await saveTask(record);
  // 异步执行
  runPipeline({ ...params, ...record }).catch(e => logger.error('[VideoGen]', taskId, e.message));
  return { taskId };
}

/**
 * 查询任务状态
 */
async function getTask(taskId, tenantId) {
  const [rows] = await db.query('SELECT * FROM ai_video_task WHERE task_id = ? AND tenant_id = ?', [taskId, tenantId]);
  return rows[0] || null;
}

module.exports = { startAsync, getTask, TEMPLATES, runPipeline, OUT_DIR };
