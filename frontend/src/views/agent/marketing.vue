<template>
  <div class="agent-page">
    <div class="page-header">
      <div class="page-title">
        <el-icon :size="26" class="t-icon"><VideoCamera /></el-icon>
        <div>
          <h2>AI短视频成片生成Agent</h2>
          <p>商品带货 · 口播脚本 · TTS配音 · 自动合成MP4</p>
        </div>
      </div>
    </div>
    <div class="agent-body">
      <el-card class="input-card" shadow="never">
        <template #header>
          <div class="card-h"><el-icon><Setting /></el-icon><span>生成参数</span></div>
        </template>
        <el-tabs v-model="activeTab" class="mode-tabs">
          <el-tab-pane label="商品带货视频" name="product">
            <el-form label-position="top">
              <div class="form-section">
                <div class="section-title"><el-icon><Picture /></el-icon>商品照片上传</div>
                <el-upload v-model:file-list="productForm.fileList" :auto-upload="false" :on-change="onFileChange" :on-remove="onUploadRemove" :on-exceed="onExceed" list-type="picture-card" :limit="5" multiple accept="image/jpeg,image/png">
                  <el-icon><Plus /></el-icon>
                  <template #tip><div class="upload-tip">上传 1-5 张商品图片（jpg/png，单张≤5MB）</div></template>
                </el-upload>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><EditPen /></el-icon>商品识别辅助</div>
                <el-form-item label="商品名称（可选）"><el-input v-model="productForm.product_name" placeholder="如：公牛G12开关插座" /></el-form-item>
                <el-form-item label="商品类别（可选）"><el-input v-model="productForm.product_category" placeholder="如：五金电工/开关插座" /></el-form-item>
                <el-form-item label="补充描述（可选）"><el-input v-model="productForm.user_desc" type="textarea" :autosize="{minRows:2,maxRows:3}" placeholder="补充商品特点、价格、材质等" /></el-form-item>
                <el-button type="primary" plain :loading="analyzing" @click="handleAnalyze" style="width:100%;">{{ analyzing ? "AI 识别中..." : "🔍 AI 识别商品并生成卖点" }}</el-button>
                <p class="hint" style="margin-top:6px;">注：DeepSeek 为文本模型，请补充名称/描述以提升识别准确度</p>
              </div>
              <div v-if="analyzed" class="form-section">
                <div class="section-title"><el-icon><Star /></el-icon>商品卖点（可编辑）</div>
                <el-form-item label="商品名称"><el-input v-model="productInfo.product_name" /></el-form-item>
                <el-form-item label="商品分类"><el-input v-model="productInfo.category" /></el-form-item>
                <el-form-item label="核心卖点（每行一条）"><el-input v-model="productInfo.core_selling_text" type="textarea" :autosize="{minRows:3,maxRows:6}" /></el-form-item>
                <el-form-item label="适用人群"><el-input v-model="productInfo.fit_crowd" type="textarea" :autosize="{minRows:2,maxRows:3}" /></el-form-item>
                <el-form-item label="使用场景"><el-input v-model="productInfo.usage_scene" type="textarea" :autosize="{minRows:2,maxRows:3}" /></el-form-item>
                <el-form-item label="完整口播脚本"><el-input v-model="productInfo.short_video_script" type="textarea" :autosize="{minRows:4,maxRows:8}" /></el-form-item>
                <el-form-item label="短视频标题"><el-input v-model="productInfo.video_title" /></el-form-item>
                <el-form-item label="话题标签（每行一条，如 #五金神器）"><el-input v-model="productInfo.hash_tag_text" type="textarea" :autosize="{minRows:2,maxRows:4}" /></el-form-item>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><User /></el-icon>本人出镜形象（可选）</div>
                <el-form-item><el-input v-model="productForm.avatar_desc" type="textarea" :autosize="{minRows:2,maxRows:3}" placeholder="如：中年男店主，穿深色工装，朴实稳重" /></el-form-item>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><MagicStick /></el-icon>商品视频模板</div>
                <div class="template-grid">
                  <div v-for="t in productTemplates" :key="t.key" :class="['tpl-card', { active: productForm.template === t.key }]" @click="productForm.template = t.key">
                    <div class="tpl-color" :style="{ background: t.color }"></div><div class="tpl-name">{{ t.name }}</div>
                  </div>
                </div>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><Clock /></el-icon>视频参数</div>
                <div class="param-row">
                  <div class="param-item"><span class="p-label">时长</span>
                    <el-radio-group v-model="productForm.duration" size="small">
                      <el-radio-button :label="15">15秒</el-radio-button><el-radio-button :label="30">30秒</el-radio-button><el-radio-button :label="60">60秒</el-radio-button>
                    </el-radio-group>
                  </div>
                  <div class="param-item"><span class="p-label">格式</span><el-tag type="info" effect="plain">MP4</el-tag></div>
                </div>
              </div>
              <el-button type="primary" :icon="Loading" :loading="generating" @click="handleProductGenerate" size="large" style="width:100%;margin-top:16px;">{{ generating ? statusText : "🎬 生成商品带货视频" }}</el-button>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="通用口播视频" name="general">
            <el-form label-position="top">
              <div class="form-section">
                <div class="section-title"><el-icon><Link /></el-icon>参考作品链接</div>
                <el-form-item><el-input v-model="form.reference_url" placeholder="粘贴抖音/快手短视频链接（可选）" /></el-form-item>
                <el-form-item><el-input v-model="form.style_hint" type="textarea" :autosize="{minRows:2,maxRows:3}" placeholder="补充说明参考风格" /></el-form-item>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><User /></el-icon>本人形象描述</div>
                <el-form-item><el-input v-model="form.avatar_desc" type="textarea" :autosize="{minRows:2,maxRows:3}" placeholder="如：五金店老板，40岁左右，朴实稳重" /></el-form-item>
                <div class="quick-tags"><span class="tag-label">快捷：</span><el-tag v-for="t in avatarTags" :key="t" size="small" effect="plain" @click="form.avatar_desc = t" class="clickable">{{ t }}</el-tag></div>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><MagicStick /></el-icon>视频模板</div>
                <div class="template-grid">
                  <div v-for="t in templates" :key="t.key" :class="['tpl-card', { active: form.template === t.key }]" @click="form.template = t.key">
                    <div class="tpl-color" :style="{ background: t.color }"></div><div class="tpl-name">{{ t.name }}</div>
                  </div>
                </div>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><Clock /></el-icon>视频参数</div>
                <div class="param-row">
                  <div class="param-item"><span class="p-label">时长</span>
                    <el-radio-group v-model="form.duration" size="small">
                      <el-radio-button :label="15">15秒</el-radio-button><el-radio-button :label="30">30秒</el-radio-button><el-radio-button :label="60">60秒</el-radio-button>
                    </el-radio-group>
                  </div>
                  <div class="param-item"><span class="p-label">格式</span><el-tag type="info" effect="plain">MP4</el-tag></div>
                </div>
              </div>
              <div class="form-section">
                <div class="section-title"><el-icon><EditPen /></el-icon>视频核心需求</div>
                <el-form-item><el-input v-model="form.user_input" type="textarea" :autosize="{minRows:3,maxRows:5}" placeholder="如：为公牛开关写一条门店引流短视频" /></el-form-item>
              </div>
              <el-button type="primary" :icon="Loading" :loading="generating" @click="handleGenerate" size="large" style="width:100%;margin-top:16px;">{{ generating ? statusText : "🎬 生成短视频成片" }}</el-button>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </el-card>
      <el-card class="result-card" shadow="never">
        <template #header>
          <div class="card-h"><el-icon><VideoPlay /></el-icon><span>AI 输出结果</span>
            <el-tag v-if="taskId" size="small" :type="statusTagType" effect="plain" style="margin-left:auto;">{{ statusText }}</el-tag>
          </div>
        </template>
        <div v-if="!taskId" class="empty">
          <el-icon :size="56" class="empty-ic"><MagicStick /></el-icon>
          <p>{{ activeTab === "product" ? "上传商品照片，点击生成商品带货视频" : "填写参数，点击生成短视频成片" }}</p>
          <p class="hint">AI 将自动完成脚本 → 配音 → 合成</p>
        </div>
        <div v-else-if="generating" class="empty">
          <el-icon :size="40" class="empty-ic spin"><Loading /></el-icon>
          <p>{{ statusText }}</p>
          <el-progress :percentage="progress" :indeterminate="true" style="width:60%;margin-top:12px;" />
          <p class="hint">一般需要 20-60 秒</p>
        </div>
        <div v-else-if="taskStatus === 'failed'" class="empty error">
          <el-icon :size="56" class="empty-ic"><Warning /></el-icon>
          <p>生成失败</p><p class="hint">{{ errorMsg }}</p>
          <el-button size="small" @click="reset">重新生成</el-button>
        </div>
        <div v-else-if="videoUrl" class="result-video">
          <video ref="videoEl" :src="videoUrl" controls class="video-player" />
          <div class="result-actions">
            <el-button type="primary" :icon="Download" @click="downloadVideo">下载视频</el-button>
            <el-button :icon="Refresh" @click="reset">重新生成</el-button>
            <el-button v-if="currentMode === 'product' && (resultTitle || resultHashTags.length)" :icon="CopyDocument" @click="copyTitleAndTags">复制标题+话题</el-button>
          </div>
          <div v-if="currentMode === 'product' && (resultTitle || resultHashTags.length)" class="result-meta">
            <div class="meta-row"><span class="meta-label">标题：</span><span>{{ resultTitle }}</span></div>
            <div class="meta-row"><span class="meta-label">话题：</span>
              <el-tag v-for="t in resultHashTags" :key="t" size="small" effect="plain" style="margin-right:4px;">{{ t }}</el-tag>
            </div>
          </div>
          <el-collapse style="margin-top:16px;" v-if="scriptText">
            <el-collapse-item title="查看 AI 生成的口播脚本" name="script"><pre class="script-pre">{{ scriptText }}</pre></el-collapse-item>
          </el-collapse>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { Loading, VideoCamera, VideoPlay, Setting, Link, User, MagicStick, Clock, EditPen, Download, Refresh, Warning, Picture, Plus, Star, CopyDocument } from "@element-plus/icons-vue";
import request from "@/api/request";

const activeTab = ref("product");
// 通用口播 Tab
const form = ref({ user_input: "为门店畅销商品写一条抖音引流短视频", reference_url: "", style_hint: "", avatar_desc: "中年男店主，穿深色工装", template: "boss_talk", duration: 30 });
const templates = [
  { key: "boss_talk", name: "老板口播风", color: "#1a1a2e" },
  { key: "product_show", name: "商品展示带货风", color: "#0f3460" },
  { key: "store_traffic", name: "门店实拍引流风", color: "#16213e" },
  { key: "story_reverse", name: "剧情反转风", color: "#2d132c" },
  { key: "knowledge", name: "知识讲解风", color: "#1b262c" },
];
const avatarTags = ["中年男店主，穿深色工装", "年轻女店员，时尚活力", "老板+员工双人搭档", "门店实拍，真实感"];

// 商品带货 Tab
const productForm = ref({ fileList: [], image_urls: [], product_name: "", product_category: "", user_desc: "", avatar_desc: "", template: "product_show", duration: 30 });
const productTemplates = [
  { key: "product_show", name: "商品展示带货风", color: "#0f3460" },
  { key: "boss_recommend", name: "老板推荐风", color: "#1a1a2e" },
  { key: "scene_grass", name: "场景种草风", color: "#16213e" },
  { key: "promo_traffic", name: "促销引流风", color: "#2d132c" },
];
const productInfo = ref({ product_name: "", category: "", core_selling_text: "", fit_crowd: "", usage_scene: "", short_video_script: "", video_title: "", hash_tag_text: "" });
const analyzed = ref(false);
const analyzing = ref(false);

// 图片压缩：自动压缩到最大1920宽度，减小base64体积，避免VL接口请求超限
function compressImage(file, maxWidth = 1920, quality = 0.85) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          const compressed = new File([blob], file.name, { type: file.type || 'image/jpeg', lastModified: Date.now() });
          console.log('[upload] compressed:', file.size, '->', compressed.size);
          resolve(compressed);
        }, file.type || 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// 选图后：Element Plus 自动生成 file.url 本地预览（立即显示缩略图）；这里负责压缩+上传到后端，拿到 serverUrl 后更新 image_urls
async function onFileChange(file, fileList) {
  console.log('[upload] change:', file.name, file.status, 'fileListLen:', fileList.length);
  const raw = file.raw;
  if (!raw) return;
  // 格式/大小校验（不合格从 fileList 移除）
  if (!/jpeg|jpg|png/i.test(raw.type)) {
    ElMessage.error("仅支持 jpg/png 格式图片");
    const idx = fileList.indexOf(file);
    if (idx > -1) fileList.splice(idx, 1);
    return;
  }
  if (raw.size / 1024 / 1024 > 5) {
    ElMessage.error("图片大小不能超过 5MB");
    const idx = fileList.indexOf(file);
    if (idx > -1) fileList.splice(idx, 1);
    return;
  }
  // 本地预览已由 Element Plus 自动生成（file.url = URL.createObjectURL(raw)）
  if (!file.url) file.url = URL.createObjectURL(raw);
  file.status = 'uploading';
  file.serverUrl = '';
  try {
    const compressed = await compressImage(raw, 1920, 0.85);
    const formData = new FormData();
    formData.append('images', compressed, compressed.name);
    const token = localStorage.getItem('token') || '';
    const resp = await fetch(`${location.origin}/api/product-video/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    const json = await resp.json();
    if (json.code === 0 && json.data && json.data.urls && json.data.urls[0]) {
      file.serverUrl = json.data.urls[0];
      file.status = 'success';
      productForm.value.image_urls = fileList.filter(f => f.serverUrl).map(f => f.serverUrl);
      ElMessage.success(`${file.name} 上传成功`);
    } else {
      file.status = 'fail';
      ElMessage.error(json.message || '上传失败');
    }
  } catch (e) {
    console.error('[upload] error:', e);
    file.status = 'fail';
    ElMessage.error('上传失败: ' + (e.message || ''));
  }
}

function onUploadRemove(file, fileList) {
  // 重新计算 image_urls（移除已删的）
  productForm.value.image_urls = fileList.filter(f => f.serverUrl).map(f => f.serverUrl);
}
function onExceed() { ElMessage.warning("最多上传 5 张商品图片"); }

async function handleAnalyze() {
  // 边界：图片和文字至少有其一（无图片时走文本模型降级）
  const hasImg = productForm.value.image_urls.length > 0;
  const hasText = productForm.value.product_name.trim() || productForm.value.user_desc.trim();
  if (!hasImg && !hasText) { ElMessage.warning("请先上传商品照片或填写商品信息"); return; }
  analyzing.value = true;
  try {
    const res = await request({ url: "/product-video/analyze", method: "POST", data: {
      image_urls: productForm.value.image_urls,
      product_name: productForm.value.product_name,
      product_category: productForm.value.product_category,
      user_desc: productForm.value.user_desc,
    }});
    // 回填新字段结构（数组 join 成多行文本便于编辑）
    productInfo.value = {
      product_name: res.product_name || productForm.value.product_name,
      category: res.category || productForm.value.product_category,
      core_selling_text: (res.core_selling || []).join("\n"),
      fit_crowd: res.fit_crowd || "",
      usage_scene: res.usage_scene || "",
      short_video_script: res.short_video_script || "",
      video_title: res.video_title || "",
      hash_tag_text: (res.hash_tag || []).join("\n"),
    };
    analyzed.value = true;
    ElMessage.success("商品识别完成，可编辑卖点");
  } catch (e) {
    // AI 失败：控制台完整报错 + 前端友好提示
    console.error("[marketing] analyze error:", e);
    ElMessage.error("识别失败: " + (e.message || "服务异常，请稍后重试"));
  } finally { analyzing.value = false; }
}

async function handleProductGenerate() {
  if (productForm.value.image_urls.length === 0) { ElMessage.warning("请先上传商品照片"); return; }
  if (!analyzed.value || !productInfo.value.product_name) { ElMessage.warning("请先点击 AI 识别商品并生成卖点"); return; }
  generating.value = true; taskId.value = ""; videoUrl.value = ""; scriptText.value = ""; errorMsg.value = "";
  resultTitle.value = ""; resultHashTags.value = [];
  try {
    // 把多行文本 split 回数组
    const coreSelling = (productInfo.value.core_selling_text || "").split(/\n/).map(s => s.trim()).filter(Boolean);
    const hashTag = (productInfo.value.hash_tag_text || "").split(/\n/).map(s => s.trim()).filter(Boolean);
    const payload = {
      product_info: {
        product_name: productInfo.value.product_name,
        category: productInfo.value.category,
        core_selling: coreSelling,
        fit_crowd: productInfo.value.fit_crowd,
        usage_scene: productInfo.value.usage_scene,
        short_video_script: productInfo.value.short_video_script,
        video_title: productInfo.value.video_title,
        hash_tag: hashTag,
      },
      product_images: productForm.value.image_urls,
      template: productForm.value.template,
      duration: productForm.value.duration,
    };
    const res = await request({ url: "/product-video/task", method: "POST", data: payload });
    taskId.value = res.task_id; currentMode.value = "product";
    ElMessage.success("商品视频任务已提交");
    pollTask(true);
  } catch (e) {
    console.error("[marketing] createTask error:", e);
    ElMessage.error("提交失败: " + (e.message || "服务异常"));
    generating.value = false;
  }
}

const taskId = ref(""); const taskStatus = ref(""); const videoUrl = ref(""); const scriptText = ref(""); const errorMsg = ref(""); const generating = ref(false); const currentMode = ref("product");
const resultTitle = ref(""); const resultHashTags = ref([]);

const statusText = computed(() => {
  const m = { pending: "等待中", generating_script: "AI 编写脚本中...", tts_generating: "生成口播音频中...", video_compositing: "合成视频画面中...", success: "✅ 生成成功", failed: "❌ 生成失败" };
  return m[taskStatus.value] || "处理中...";
});
const statusTagType = computed(() => { if (taskStatus.value === "success") return "success"; if (taskStatus.value === "failed") return "danger"; return "warning"; });
const progress = computed(() => { const m = { pending: 10, generating_script: 30, tts_generating: 55, video_compositing: 80 }; return m[taskStatus.value] || 0; });

async function handleGenerate() {
  if (!form.value.user_input.trim()) { ElMessage.warning("请填写视频核心需求"); return; }
  generating.value = true; taskId.value = ""; videoUrl.value = ""; scriptText.value = ""; errorMsg.value = "";
  try {
    const res = await request({ url: "/video-task/task", method: "POST", data: form.value });
    taskId.value = res.task_id; currentMode.value = "general";
    ElMessage.success("任务已提交"); pollTask(false);
  } catch (e) { ElMessage.error("提交失败: " + (e.message || "")); generating.value = false; }
}

function parseJsonArray(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function pollTask(isProduct) {
  const base = isProduct ? "/product-video/task/" : "/video-task/task/";
  const pollId = setInterval(async () => {
    try {
      const res = await request({ url: base + taskId.value, method: "GET" });
      taskStatus.value = res.status;
      scriptText.value = res.short_video_script || res.sales_script || res.script_text || "";
      errorMsg.value = res.error_msg || "";
      if (isProduct) {
        resultTitle.value = res.video_title || "";
        resultHashTags.value = parseJsonArray(res.hash_tag);
      }
      if (res.status === "success") {
        videoUrl.value = (res.video_path || "").startsWith("http") ? res.video_path : `${location.origin}${res.video_path}`;
        generating.value = false; clearInterval(pollId);
      } else if (res.status === "failed") { generating.value = false; clearInterval(pollId); }
    } catch (e) { console.error("[marketing] poll error:", e); }
  }, 2000);
}

function downloadVideo() { const a = document.createElement("a"); a.href = videoUrl.value; a.download = `${taskId.value}.mp4`; a.click(); }
async function copyTitleAndTags() {
  const tags = resultHashTags.value.join(" ");
  const text = `${resultTitle.value}\n${tags}`.trim();
  if (!text) { ElMessage.warning("暂无可复制内容"); return; }
  try { await navigator.clipboard.writeText(text); ElMessage.success("已复制标题+话题标签"); }
  catch (e) { ElMessage.error("复制失败：" + e.message); }
}
function reset() { taskId.value = ""; taskStatus.value = ""; videoUrl.value = ""; scriptText.value = ""; errorMsg.value = ""; resultTitle.value = ""; resultHashTags.value = []; generating.value = false; }
</script>

<style scoped>
.agent-page{display:flex;flex-direction:column;padding-bottom:20px}
.page-header{margin-bottom:16px}
.page-title{display:flex;align-items:center;gap:12px}
.t-icon{color:#e94560}
.page-title h2{margin:0;font-size:20px}
.page-title p{margin:4px 0 0;color:#909399;font-size:13px}
.agent-body{flex:1;display:grid;grid-template-columns:380px 1fr;gap:16px;min-height:0}
.input-card,.result-card{display:flex;flex-direction:column}
.input-card :deep(.el-card__body){flex:1;overflow-y:auto}
.result-card :deep(.el-card__body){flex:1}
.card-h{display:flex;align-items:center;gap:6px;font-weight:500}
.mode-tabs{margin-top:-6px}
.mode-tabs :deep(.el-tabs__header){margin-bottom:12px}
.form-section{margin-bottom:16px;padding-bottom:12px;border-bottom:1px dashed #ebeef5}
.form-section:last-of-type{border-bottom:none}
.section-title{font-size:13px;font-weight:600;color:#303133;margin-bottom:8px;display:flex;align-items:center;gap:4px}
.quick-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.tag-label{font-size:12px;color:#909399;margin-right:4px}
.clickable{cursor:pointer}
.template-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.tpl-card{border:2px solid #e4e7ed;border-radius:8px;padding:8px;cursor:pointer;text-align:center;transition:.15s}
.tpl-card.active{border-color:#e94560;background:#fff5f6}
.tpl-color{height:36px;border-radius:4px;margin-bottom:4px}
.tpl-name{font-size:11px;color:#606266}
.param-row{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.param-item{display:flex;align-items:center;gap:8px}
.p-label{font-size:13px;color:#606266}
.upload-tip{font-size:12px;color:#909399;margin-top:4px}
.empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#909399;gap:8px}
.empty.error{color:#f56c6c}
.empty-ic{color:#c0c4cc}
.empty-ic.spin{animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
.hint{font-size:12px;color:#c0c4cc}
.result-video{height:100%;display:flex;flex-direction:column;gap:12px}
.video-player{width:100%;max-height:480px;border-radius:8px;background:#000;object-fit:contain}
.result-actions{display:flex;gap:8px;flex-wrap:wrap}
.result-meta{background:#f5f7fa;padding:12px;border-radius:6px;font-size:13px}
.meta-row{display:flex;gap:6px;align-items:flex-start;margin-bottom:6px}
.meta-row:last-child{margin-bottom:0}
.meta-label{color:#909399;flex-shrink:0}
.script-pre{background:#f5f7fa;padding:12px;border-radius:6px;font-size:13px;white-space:pre-wrap;max-height:300px;overflow-y:auto;margin:0;font-family:Menlo,monospace}

@media (max-width: 768px) {
  .agent-body { grid-template-columns: 1fr !important; }
}
</style>
