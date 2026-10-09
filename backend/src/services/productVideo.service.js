// 商品销售视频生成流水线
// 流程：上传图片 → AI识别生成卖点 → 用户编辑 → 生成商品宣传视频
// 视频生成：优先外部文生视频AI；不可用则降级为高级幻灯片（Ken Burns + 转场 + 卖点字幕动画 + 配音 + BGM）
const fs = require('fs');
const path = require('path');
const { callLlm, callLlmAuto, fileToDataUrl } = require('../../utils/llm');
const ffmpeg = require('../utils/ffmpeg');
const tts = require('../utils/tts');
const db = require('../config/db');

const OUT_DIR = path.resolve(__dirname, '../../videos_out');
const TMP_DIR = path.resolve(__dirname, '../../uploads/product');

// ?? HTTP ??????????????????????

const BGM_FILE = path.resolve(__dirname, '../../assets/bgm.mp3');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

if (!fs.existsSync(path.resolve(__dirname, '../../videos_out'))) fs.mkdirSync(path.resolve(__dirname, '../../videos_out'), { recursive: true });

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/msyhbd.ttf',
  'C:/Windows/Fonts/simsun.ttc',
];
let FONT_FILE = null;
for (const f of FONT_CANDIDATES) {
  if (fs.existsSync(f)) { FONT_FILE = f.replace(/\//g, '\\'); break; }
}

// 文生视频外部模型配置（环境变量 TTV_API_URL + TTV_API_KEY；未配置自动降级）
const TTV_API_URL = process.env.TTV_API_URL || '';
const TTV_API_KEY = process.env.TTV_API_KEY || '';

const PRODUCT_TEMPLATES = {
  product_show: { name: '商品展示带货风', bgColor: '#0f3460', accent: '#e94560', style: '展示' },
  boss_recommend: { name: '老板推荐风', bgColor: '#1a1a2e', accent: '#e94560', style: '推荐' },
  scene_grass: { name: '场景种草风', bgColor: '#16213e', accent: '#0f9b8e', style: '种草' },
  promo_traffic: { name: '促销引流风', bgColor: '#2d132c', accent: '#ff6b6b', style: '促销' },
};

function genTaskId() {
  return 'PRD_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function urlToLocalPath(url) {
  if (!url) return null;
  const m = String(url).match(/^\/uploads\/(.+)$/);
  if (!m) return null;
  return path.resolve(__dirname, '../../uploads', m[1]);
}

async function analyzeProduct(params) {
  const { imageUrls = [], productName = '', productCategory = '', userDesc = '' } = params;
  const imageDataUrls = (imageUrls || [])
    .map(urlToLocalPath)
    .map(p => p ? fileToDataUrl(p) : null)
    .filter(Boolean);
  const fileNames = (imageUrls || []).map(u => decodeURIComponent(String(u).split('/').pop() || ''));
  const hint = [
    productName ? '商品名称：' + productName : '',
    productCategory ? '商品类别：' + productCategory : '',
    userDesc ? '补充描述：' + userDesc : '',
    fileNames.length ? '图片文件名：' + fileNames.join('、') : '',
  ].filter(Boolean).join('\n');
  if (!hint.trim() && imageDataUrls.length === 0) {
    throw new Error('请至少补充商品名称或商品描述，或上传商品图片，AI 才能生成卖点');
  }
  const hasImg = imageDataUrls.length > 0;
  const prompt = '你是电商带货短视频编剧。请' + (hasImg ? '仔细观察上传的商品图片，识别商品外观、材质、功能、品牌、包装等特征，' : '根据以下信息，') + '识别商品并生成销售卖点。\n\n' + (hint ? '【输入信息】\n' + hint : '【输入信息】见上传的商品图片') + '\n\n请输出纯 JSON（不要 markdown，不要 ```json 包裹，不要多余文字），字段如下：\n{\n  "product_name": "商品名称",\n  "category": "商品分类",\n  "core_selling": ["卖点1", "卖点2", "卖点3"],\n  "fit_crowd": "适用人群",\n  "usage_scene": "使用场景",\n  "short_video_script": "完整短视频口播脚本80-150字",\n  "video_title": "短视频标题",\n  "hash_tag": ["#话题1", "#话题2"]\n}';
  let raw;
  try {
    if (hasImg) console.log('[analyzeProduct] 使用视觉模型识别商品（deepseek-v4-flash-vision-exp）');
    else console.warn('[analyzeProduct] 仅文字生成卖点（deepseek-chat）');
    raw = await callLlmAuto('', prompt, imageDataUrls);
  } catch (vlErr) {
    console.error('[analyzeProduct] VL model error, fallback to text:', vlErr.message);
    if (!hint.trim()) throw new Error('视觉模型暂不可用，且未提供文字信息，无法识别');
    raw = await callLlm('', prompt);
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI 返回格式异常，未识别到 JSON');
  let json;
  try { json = JSON.parse(m[0]); } catch (e) { throw new Error('AI 返回 JSON 解析失败: ' + e.message); }
  const toArr = v => Array.isArray(v) ? v : (v ? [String(v)] : []);
  return {
    product_name: json.product_name || productName || '',
    category: json.category || productCategory || '',
    core_selling: toArr(json.core_selling),
    fit_crowd: json.fit_crowd || '',
    usage_scene: json.usage_scene || '',
    short_video_script: json.short_video_script || '',
    video_title: json.video_title || '',
    hash_tag: toArr(json.hash_tag).map(t => t.startsWith('#') ? t : '#' + t),
  };
}

async function saveTask(task) {
  const sql = 'INSERT INTO ai_product_video_record (task_id, tenant_id, product_images, product_name, category, core_selling, fit_crowd, usage_scene, short_video_script, video_title, hash_tag, template_key, duration, video_path, status, error_msg, video_source, create_time, update_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW(), NOW())';
  await db.query(sql, [
    task.taskId, task.tenantId, JSON.stringify(task.productImages || []),
    task.productName || '', task.category || '', JSON.stringify(task.coreSelling || []),
    task.fitCrowd || '', task.usageScene || '', task.shortVideoScript || '',
    task.videoTitle || '', JSON.stringify(task.hashTag || []), task.templateKey, task.duration,
    task.videoUrl || '', task.status, task.errorMsg || '', task.videoSource || ''
  ]);
}

async function updateTask(taskId, status, patch = {}) {
  const sets = ['status = ?', 'update_time = NOW()'];
  const vals = [status];
  for (const [k, v] of Object.entries(patch)) { sets.push(k + ' = ?'); vals.push(v); }
  vals.push(taskId);
  await db.query('UPDATE ai_product_video_record SET ' + sets.join(', ') + ' WHERE task_id = ?', vals);
}

// 外部文生视频 API（预留；未配置或失败返回 null 自动降级）
async function callTextToVideo(params) {
  if (!TTV_API_URL || !TTV_API_KEY) return null;
  try {
    const axios = require('axios');
    const resp = await axios.post(TTV_API_URL, { prompt: params.prompt, duration: params.duration, width: 1080, height: 1920 }, {
      headers: { Authorization: 'Bearer ' + TTV_API_KEY, 'Content-Type': 'application/json' }, timeout: 120000
    });
    if (resp.data && resp.data.video_url) return resp.data.video_url;
    return null;
  } catch (e) {
    console.warn('[TTV] 文生视频接口不可用，降级为高级幻灯片:', e.message);
    return null;
  }
}

// 单张图片 Ken Burns 动效：缓慢缩放+平移
async function generateKenBurnsSegment(imagePath, duration, outPath, width, height, zoomIn) {
  width = width || 720; height = height || 1280;
  const frames = Math.max(30, Math.floor(duration * 20));
  const zoomExpr = zoomIn ? "min(zoom+0.0012,1.35)" : "max(zoom-0.0012,1.0)";
  const filter = '[0:v]scale=' + Math.round(width * 1.3) + ':' + Math.round(height * 1.3) +
    ':force_original_aspect_ratio=increase,crop=' + width + ':' + height + ',' +
    'zoompan=z=\'' + zoomExpr + '\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=' + frames +
    ':s=' + width + 'x' + height + ':fps=20,setpts=PTS-STARTPTS,setsar=1[v]';
  const buf = await ffmpeg.runCapture(['-y', '-i', imagePath, '-filter_complex', filter, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], 90000);
  await writeFile(outPath, buf);
}

// 多段 Ken Burns + xfade 转场拼接
async function generatePromoVideo(productImages, sellingPoints, totalSec, outPath, width, height) {
  width = width || 720; height = height || 1280;
  const localFiles = (productImages || []).map(urlToLocalPath).filter(f => f && fs.existsSync(f));
  if (localFiles.length === 0) {
    const tpl = PRODUCT_TEMPLATES.product_show;
    await ffmpeg.run(['-y', '-f', 'lavfi', '-i', 'color=c=' + tpl.bgColor + ':s=' + width + 'x' + height + ':d=' + totalSec + ':r=30', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', outPath]);
    return { sceneTimestamps: [] };
  }
  const numScenes = Math.min(localFiles.length, Math.max(1, sellingPoints.length), 3);
  const sceneDur = Math.max(3, Math.floor(totalSec / numScenes));
  const xfadeDur = 0.5;
  const segments = [];
  for (let i = 0; i < numScenes; i++) {
    const segPath = path.join(TMP_DIR, path.basename(outPath, '.mp4') + '_seg' + i + '.mp4');
    await generateKenBurnsSegment(localFiles[i % localFiles.length], sceneDur, segPath, width, height, i % 2 === 0);
    segments.push({ path: segPath, duration: sceneDur });
  }
  if (segments.length === 1) {
    await copyFile(segments[0].path, outPath);
  } else {
    // ? concat ????????????????? xfade?
    const listFile = path.join(TMP_DIR, path.basename(outPath, '.mp4') + '_list.txt');
    const listContent = segments.map(s => "file '" + s.path.replace(/\\/g, '/') + "'").join('\n');
    await writeFile(listFile, listContent, 'utf8');
    const cbuf = await ffmpeg.runCapture(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], 120000);
    await writeFile(outPath, cbuf);
    try { try { fs.unlinkSync(listFile); } catch(e) {}; } catch (e) {}
  }
  const effectiveDur = sceneDur - xfadeDur;
  const sceneTimestamps = sellingPoints.slice(0, numScenes).map(function(sp, i) {
    return { text: sp, start: i * effectiveDur, end: (i + 1) * effectiveDur + 0.3 };
  });
  segments.forEach(function(s) { try { try { fs.unlinkSync(s.path); } catch(e) {}; } catch (e) {} });
  return { sceneTimestamps: sceneTimestamps };
}

// 卖点字幕：分时段淡入淡出
async function addAnimatedSubtitles(taskId, videoIn, sceneTimestamps, videoOut, width, height) {
  width = width || 720; height = height || 1280;
  if (!sceneTimestamps || sceneTimestamps.length === 0 || !FONT_FILE) { await copyFile(videoIn, videoOut); return; }
  const fontEsc = "'" + FONT_FILE.replace(/\\/g, '/').replace(/:/g, '\\:') + "'";
  const fontSize = Math.floor(width / 16);
  const y = Math.floor(height * 0.68);
  const fadeDur = 0.4;
  const drawtexts = sceneTimestamps.map(function(s) {
    const text = String(s.text).replace(/'/g, '').slice(0, 20);
    const tIn = s.start;
    const tOut = Math.max(s.start + 0.1, s.end - fadeDur);
    const alpha = 'if(between(t,' + tIn + ',' + s.end + '), if(lt(t-' + tIn + ',' + fadeDur + '), (t-' + tIn + ')/' + fadeDur + ', if(gt(t-' + tOut + ',0), 1-(t-' + tOut + ')/' + fadeDur + ', 1)), 0)';
    return "drawtext=fontfile=" + fontEsc + ":text='" + text + "':x=(w-text_w)/2:y=" + y + ":fontsize=" + fontSize + ":fontcolor=white:box=1:boxcolor=black\\@0.55:boxborderw=18:alpha='" + alpha + "'";
  }).join(',');
  const sbuf = await ffmpeg.runCapture(['-y', '-i', videoIn, '-vf', drawtexts, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p', '-an', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], 180000);
  await writeFile(videoOut, sbuf);
}

async function muxAudioVideo(videoIn, audioBuf, bgmFile, outPath) {
  const { spawn } = require('child_process');
  const args = ['-y', '-i', videoIn, '-i', 'pipe:0'];
  if (bgmFile && fs.existsSync(bgmFile)) {
    args.push('-i', bgmFile);
    args.push('-filter_complex', '[1:a]volume=1.0[a1];[2:a]volume=0.15[a2];[a1][a2]amix=inputs=2:duration=shortest[aout]', '-map', '0:v:0', '-map', '[aout]');
  } else {
    args.push('-map', '0:v:0', '-map', '1:a:0');
  }
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1');
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg.FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let err = '';
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', async code => {
      if (code === 0) { try { await writeFile(outPath, Buffer.concat(chunks)); resolve(); } catch(e) { reject(e); } }
      else reject(new Error('mux exit=' + code + ': ' + err.slice(-400)));
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(audioBuf);
  });
}

async function runPipeline(params) {
  const taskId = params.taskId, tenantId = params.tenantId, productInfo = params.productInfo, templateKey = params.templateKey, duration = params.duration, productImages = params.productImages;
  const width = 720, height = 1280, fps = 20;
  try {
    await updateTask(taskId, 'generating_script');
    const speech = productInfo.short_video_script || productInfo.sales_script || '';
    if (!speech) throw new Error('AI ???????????');
    const sellingPoints = Array.isArray(productInfo.core_selling) ? productInfo.core_selling : [];
    await updateTask(taskId, 'ai_video_generating');
    const ttvPrompt = '???????' + (productInfo.product_name || '') + '????' + sellingPoints.join('?');
    const ttvUrl = await callTextToVideo({ prompt: ttvPrompt, duration: duration || 30 });
    if (ttvUrl) {
      await updateTask(taskId, 'success', { video_path: ttvUrl, video_source: 'ai_text_to_video' });
      return { taskId: taskId, videoUrl: ttvUrl };
    }
    console.log('[ProductVideo] ??????????????');
    await updateTask(taskId, 'tts_generating');
    const audioBuf = await tts.synthesize(speech, { voice: 'Microsoft Huihui Desktop' });
    const audioDur = ffmpeg.getWavDuration(audioBuf);
    const finalDur = Math.max(Math.ceil(audioDur + 1), duration || 30);
    await updateTask(taskId, 'video_compositing');

    const localFiles = (productImages || []).map(urlToLocalPath).filter(f => f && fs.existsSync(f));
    if (localFiles.length === 0) throw new Error('???????');
    const numScenes = Math.min(localFiles.length, Math.max(1, sellingPoints.length), 3);
    const sceneDur = Math.max(3, Math.floor(finalDur / numScenes));
    const frames = Math.floor(sceneDur * fps);

    // ???? FFmpeg ??
    const args = ['-y'];
    for (let k = 0; k < numScenes; k++) args.push('-i', localFiles[k]);
    args.push('-i', 'pipe:0'); // audio

    const filters = [];
    for (let k = 0; k < numScenes; k++) {
      const zoomExpr = k % 2 === 0 ? "min(zoom+0.0012,1.35)" : "max(zoom-0.0012,1.0)";
      filters.push('[' + k + ':v]scale=' + Math.round(width * 1.3) + ':' + Math.round(height * 1.3) +
        ':force_original_aspect_ratio=increase,crop=' + width + ':' + height + ',' +
        'zoompan=z=\'' + zoomExpr + '\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=' + frames +
        ':s=' + width + 'x' + height + ':fps=' + fps + ',setpts=PTS-STARTPTS[v' + k + ']');
    }
    // xfade ??
    let prev = 'v0';
    for (let k = 1; k < numScenes; k++) {
      const offset = k * sceneDur - 0.5;
      filters.push('[' + prev + '][v' + k + ']xfade=transition=fade:duration=0.5:offset=' + offset + '[xv' + k + ']');
      prev = 'xv' + k;
    }
    // ??
    if (sellingPoints.length > 0 && FONT_FILE) {
      const fontEsc = "'" + FONT_FILE.replace(/\\/g, '/').replace(/:/g, '\\:') + "'";
      const fontSize = Math.floor(width / 16);
      const y = Math.floor(height * 0.68);
      const fadeDur = 0.4;
      const drawtexts = sellingPoints.slice(0, numScenes).map(function(sp, idx) {
        const text = String(sp).replace(/'/g, '').slice(0, 20);
        const tIn = idx * sceneDur;
        const tOut = Math.max(tIn + 0.1, (idx + 1) * sceneDur - fadeDur);
        const alpha = 'if(between(t,' + tIn + ',' + ((idx + 1) * sceneDur) + '), if(lt(t-' + tIn + ',' + fadeDur + '), (t-' + tIn + ')/' + fadeDur + ', if(gt(t-' + tOut + ',0), 1-(t-' + tOut + ')/' + fadeDur + ', 1)), 0)';
        return "drawtext=fontfile=" + fontEsc + ":text='" + text + "':x=(w-text_w)/2:y=" + y + ":fontsize=" + fontSize + ":fontcolor=white:box=1:boxcolor=black\\@0.55:boxborderw=18:alpha='" + alpha + "'";
      }).join(',');
      filters.push('[' + prev + ']' + drawtexts + '[outv]');
      prev = 'outv';
    }
    args.push('-filter_complex', filters.join(';'));
    args.push('-map', '[' + prev + ']', '-map', numScenes + ':a');
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1');

    const { spawn } = require('child_process');
    const videoBuf = await new Promise((resolve, reject) => {
      const proc = spawn(ffmpeg.FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = [];
      let err = '';
      proc.stdout.on('data', d => chunks.push(d));
      proc.stderr.on('data', d => { err += d.toString(); });
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error('ffmpeg exit=' + code + ': ' + err.slice(-400)));
      });
      proc.stdin.on('error', () => {});
      proc.stdin.end(audioBuf);
    });

    // ???? BLOB
    await db.query('UPDATE ai_product_video_record SET video_blob = ?, video_path = ?, video_source = ?, status = ? WHERE task_id = ?',
      [videoBuf, '/api/product-video/stream/' + taskId, 'slideshow_kenburns', 'success', taskId]);
    console.log('[ProductVideo] ??????????:', (videoBuf.length / 1024 / 1024).toFixed(2), 'MB');
    return { taskId: taskId, videoUrl: '/api/product-video/stream/' + taskId };
  } catch (err) {
    console.error('[ProductVideo] pipeline error:', err);
    await updateTask(taskId, 'failed', { error_msg: String(err.message || err).slice(0, 500) });
    throw err;
  }
}

async function startAsync(params) {
  const taskId = genTaskId();
  const pi = params.productInfo || {};
  const record = {
    taskId: taskId, tenantId: params.tenantId,
    productImages: params.productImages || pi.productImages || [],
    productName: pi.product_name || '', category: pi.category || '',
    coreSelling: pi.core_selling || [], fitCrowd: pi.fit_crowd || '',
    usageScene: pi.usage_scene || '', shortVideoScript: pi.short_video_script || '',
    videoTitle: pi.video_title || '', hashTag: pi.hash_tag || [],
    templateKey: params.templateKey || 'product_show', duration: params.duration || 30,
    status: 'pending', videoSource: '',
  };
  await saveTask(record);
  runPipeline({ taskId: taskId, tenantId: params.tenantId, productInfo: params.productInfo, productImages: params.productImages || pi.productImages || [], templateKey: params.templateKey, duration: params.duration }).catch(function(e) { console.error('[ProductVideo]', taskId, e.message); });
  return { taskId: taskId };
}

async function getTask(taskId, tenantId) {
  const rows = await db.query('SELECT task_id, tenant_id, product_name, category, core_selling, fit_crowd, usage_scene, short_video_script, video_title, hash_tag, template_key, duration, status, video_path, video_source, error_msg, create_time, update_time FROM ai_product_video_record WHERE task_id = ? AND tenant_id = ?', [taskId, tenantId]);
  return rows[0] || null;
}
async function getTaskRaw(taskId) {
  const rows = await db.query('SELECT video_blob FROM ai_product_video_record WHERE task_id = ?', [taskId]);
  return rows;
}

module.exports = { startAsync: startAsync, getTask: getTask, getTaskRaw: getTaskRaw, analyzeProduct: analyzeProduct, PRODUCT_TEMPLATES: PRODUCT_TEMPLATES, runPipeline: runPipeline, OUT_DIR: OUT_DIR };