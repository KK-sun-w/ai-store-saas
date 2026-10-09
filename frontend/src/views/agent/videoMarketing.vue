<!-- 短视频营销Agent - 仅店主可见 -->
<!-- 企业级升级: 新增数字人形象管理 + 任务轮询 + 视频预览 + 失败重试 -->
<template>
  <div class="video-agent-page">
    <div class="page-header">
      <h2 class="page-title">🎬 短视频营销Agent</h2>
      <span class="page-desc">输入需求，AI自动生成带货脚本 + 提示词 + 短视频</span>
    </div>

    <div class="main-grid">
      <!-- 左侧: 输入区 -->
      <el-card shadow="never" class="input-card">
        <template #header>
          <div class="card-hdr">
            <el-icon><EditPen /></el-icon>
            <span>需求描述</span>
          </div>
        </template>

        <!-- 数字人形象管理(折叠面板) -->
        <el-collapse class="dh-collapse">
          <el-collapse-item title="👤 数字人形象管理" name="dh">
            <div class="dh-list">
              <div v-for="dh in digitalHumans" :key="dh.id" class="dh-card">
                <el-image :src="resolveUrl(dh.image_url)" fit="cover" class="dh-thumb" />
                <div class="dh-info">
                  <div class="dh-name">{{ dh.name }}</div>
                  <div class="dh-desc">{{ dh.description || '—' }}</div>
                </div>
                <el-button text type="danger" size="small" @click="removeDigitalHuman(dh.id)">删除</el-button>
              </div>
              <div v-if="!digitalHumans.length" class="dh-empty">暂无数字人，点击下方创建</div>
            </div>
            <el-form :inline="true" class="dh-form">
              <el-upload
                :show-file-list="false" accept="image/*"
                :before-upload="(f) => { dhFile = f; return false }"
              >
                <el-button size="small">选择人像图</el-button>
                <span v-if="dhFile" class="dh-file-name">{{ dhFile.name }}</span>
              </el-upload>
              <el-input v-model="dhForm.name" placeholder="形象名称" size="small" style="width:140px" />
              <el-input v-model="dhForm.description" placeholder="描述(可选)" size="small" style="width:180px" />
              <el-button type="primary" size="small" :loading="dhLoading" :disabled="!dhFile || !dhForm.name" @click="createDigitalHuman">创建</el-button>
            </el-form>
          </el-collapse-item>
        </el-collapse>

        <el-form :model="form" label-width="90px" label-position="top">
          <el-form-item label="视频需求">
            <el-input v-model="form.input" type="textarea" :rows="4" placeholder="例如: 拿本店卖的保温杯，生成30秒带货短视频，老板口播风格" maxlength="2000" show-word-limit />
          </el-form-item>

          <el-form-item label="模板风格">
            <el-select v-model="form.template" style="width:100%">
              <el-option v-for="t in templates" :key="t.key" :label="t.name" :value="t.key" />
            </el-select>
          </el-form-item>

          <el-form-item label="时长(秒)">
            <el-slider v-model="form.duration" :min="15" :max="60" :step="5" :marks="{15:'15',30:'30',45:'45',60:'60'}" />
          </el-form-item>

          <!-- 选择数字人(选择后自动切到即梦模式) -->
          <el-divider content-position="left">数字人选择（即梦模式）</el-divider>
          <el-form-item label="数字人形象">
            <el-select v-model="form.digital_human_id" placeholder="不选则本地合成" clearable style="width:100%">
              <el-option v-for="dh in digitalHumans" :key="dh.id" :label="dh.name" :value="dh.id" />
            </el-select>
            <div class="hint">选择数字人后走即梦AI生成;不选走本地ffmpeg合成</div>
          </el-form-item>

          <!-- 素材上传 -->
          <el-divider content-position="left">素材上传（可选）</el-divider>

          <el-form-item label="商品图片">
            <el-upload
              :action="uploadUrl" :headers="uploadHeaders" name="file"
              :show-file-list="false" accept="image/*"
              :on-success="(r) => onUploadSuccess(r, 'image')"
              :on-error="onUploadError"
              class="uploader"
            >
              <div v-if="materials.image" class="thumb-wrap">
                <el-image :src="materials.image.url" fit="cover" class="thumb" />
                <span class="thumb-tag">✓ 已上传</span>
              </div>
              <div v-else class="upload-placeholder">
                <el-icon :size="24"><Plus /></el-icon>
                <span>上传商品图</span>
              </div>
            </el-upload>
          </el-form-item>

          <el-form-item label="商品介绍">
            <el-input v-model="form.avatar_desc" type="textarea" :rows="2" placeholder="商品卖点/口播提示词(可选)" maxlength="500" show-word-limit />
          </el-form-item>
        </el-form>

        <div class="action-bar">
          <el-button type="primary" size="large" :loading="loading" :disabled="!form.input.trim()" @click="runAgent">
            <el-icon><VideoCamera /></el-icon> 生成短视频
          </el-button>
          <span v-if="quotaInfo" class="quota-tip">
            今日AI额度: <b>{{ quotaInfo.usedCount }}</b> / {{ quotaInfo.dailyLimit }}
          </span>
        </div>
      </el-card>

      <!-- 右侧: 输出 -->
      <el-card shadow="never" class="output-card">
        <template #header>
          <div class="card-hdr">
            <el-icon><Document /></el-icon>
            <span>生成结果</span>
            <span v-if="taskStatus" class="task-status" :class="'st-' + taskStatus">{{ statusText }}</span>
          </div>
        </template>

        <div v-if="!result && !loading && !taskStatus" class="empty-state">
          <el-icon :size="48" color="#dcdfe6"><VideoPlay /></el-icon>
          <p>在左侧描述需求，点击「生成短视频」</p>
        </div>

        <div v-else-if="loading || ['pending','generating_script','tts_generating','video_compositing'].includes(taskStatus)" class="loading-state">
          <el-icon class="is-loading" :size="32" color="#409eff"><Loading /></el-icon>
          <p>{{ statusText }}，通常需要 30-120 秒...</p>
        </div>

        <div v-else-if="taskStatus === 'failed'" class="failed-state">
          <el-icon :size="40" color="#f56c6c"><CircleCloseFilled /></el-icon>
          <p>生成失败: {{ errorMsg || '未知错误' }}</p>
          <el-button type="primary" @click="runAgent">重新生成</el-button>
        </div>

        <div v-else class="result-content">
          <video v-if="videoUrl" :src="videoUrl" controls class="result-video" />
          <div v-html="renderedResult"></div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { EditPen, Plus, VideoCamera, Document, VideoPlay, Loading, CircleCloseFilled } from '@element-plus/icons-vue'
import {
  createVideoTask, getVideoTask,
  listDigitalHumans, createDigitalHuman as createDHApi, deleteDigitalHuman,
} from '@/api/videoAgent'

import { useUserStore } from '@/stores/user'
import { getTodayQuota } from '@/api/quota'

const userStore = useUserStore()
const uploadUrl = window.location.origin + '/api/upload'
const uploadHeaders = computed(() => ({ Authorization: 'Bearer ' + (localStorage.getItem('token') || '') }))

const templates = [
  { key: 'boss_talk', name: '老板口播风' },
  { key: 'product_show', name: '商品展示带货风' },
  { key: 'store_traffic', name: '门店实拍引流风' },
  { key: 'story_reverse', name: '剧情反转风' },
  { key: 'knowledge', name: '知识讲解风' },
]

const form = reactive({
  input: '', template: 'boss_talk', duration: 30,
  digital_human_id: null, avatar_desc: '',
})
const materials = reactive({ image: null, avatar: null })
const loading = ref(false)
const result = ref('')
const renderedResult = computed(() => result.value)
const quotaInfo = ref(null)

// 数字人管理
const digitalHumans = ref([])
const dhForm = reactive({ name: '', description: '' })
const dhFile = ref(null)
const dhLoading = ref(false)

// 任务轮询
const taskId = ref(null)
const taskStatus = ref('')
const videoUrl = ref('')
const errorMsg = ref('')
let pollTimer = null

const STATUS_TEXT = {
  pending: '排队中',
  generating_script: '生成脚本',
  tts_generating: '合成语音',
  video_compositing: '合成视频',
  success: '已完成',
  failed: '生成失败',
}
const statusText = computed(() => STATUS_TEXT[taskStatus.value] || taskStatus.value)

function resolveUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return window.location.origin + url
}

function onUploadSuccess(resp, type) {
  const url = resp?.data?.url || resp?.url
  if (!url) { ElMessage.error('上传响应异常'); return }
  materials[type] = { url: resolveUrl(url) }
  ElMessage.success('素材已保存')
}
function onUploadError() { ElMessage.error('上传失败,请检查文件大小') }

async function loadQuota() {
  try {
    const r = await getTodayQuota()
    quotaInfo.value = r.data || null
  } catch {}
}

// ============ 数字人 CRUD ============
async function loadDigitalHumans() {
  try {
    const r = await listDigitalHumans()
    digitalHumans.value = r.data?.list || []
  } catch (e) { ElMessage.error('加载数字人失败') }
}

async function createDigitalHuman() {
  if (!dhFile.value || !dhForm.name) return
  dhLoading.value = true
  try {
    const fd = new FormData()
    fd.append('image', dhFile.value)
    fd.append('name', dhForm.name)
    fd.append('description', dhForm.description || '')
    await createDHApi(fd)
    ElMessage.success('数字人创建成功')
    dhFile.value = null; dhForm.name = ''; dhForm.description = ''
    await loadDigitalHumans()
  } catch (e) {
    ElMessage.error(e?.message || '创建失败')
  } finally { dhLoading.value = false }
}

async function removeDigitalHuman(id) {
  try {
    await deleteDigitalHuman(id)
    ElMessage.success('已删除')
    await loadDigitalHumans()
  } catch (e) { ElMessage.error('删除失败') }
}

// ============ 生成 + 轮询 ============
async function runAgent() {
  if (userStore.role !== 'owner') { ElMessage.error('仅店主可使用'); return }
  loading.value = true; result.value = ''; taskStatus.value = ''; videoUrl.value = ''; errorMsg.value = ''
  try {
    const r = await createVideoTask({
      user_input: form.input,
      reference_url: materials.image?.url || '',
      avatar_desc: form.avatar_desc,
      template: form.template,
      duration: form.duration,
      digital_human_id: form.digital_human_id || undefined,
      provider: form.digital_human_id ? 'jimeng' : 'local',
    })
    taskId.value = r.data?.task_id
    ElMessage.success('任务已提交')
    loadQuota()
    if (taskId.value) startPolling()
  } catch (e) {
    const msg = e?.message || '生成失败'
    taskStatus.value = 'failed'
    errorMsg.value = msg
    ElMessage.error(msg)
  } finally { loading.value = false }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const r = await getVideoTask(taskId.value)
      const task = r.data
      if (!task) return
      taskStatus.value = task.status
      if (task.status === 'success') {
        videoUrl.value = task.video_path ? resolveUrl(task.video_path) : ''
        result.value = task.script_text ? '口播文案：' + task.script_text : '生成完成'
        stopPolling()
      } else if (task.status === 'failed') {
        errorMsg.value = task.error_msg
        stopPolling()
      }
    } catch (e) { /* 单次查询失败不中断轮询 */ }
  }, 3000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

onMounted(() => {
  if (userStore.role !== 'owner') { ElMessage.warning('仅店主角色可访问本页面'); return }
  loadQuota()
  loadDigitalHumans()
})

onUnmounted(() => { stopPolling() })
</script>

<style scoped>
.video-agent-page { padding: 16px; height: 100%; overflow: auto; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; margin: 0; color: #303133; }
.page-desc { font-size: 13px; color: #909399; margin-top: 4px; display: block; }

.main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 900px) { .main-grid { grid-template-columns: 1fr; } }

.card-hdr { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.task-status { margin-left: auto; font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #ecf5ff; color: #409eff; }
.task-status.st-success { background: #f0f9eb; color: #67c23a; }
.task-status.st-failed { background: #fef0f0; color: #f56c6c; }

.dh-collapse { margin-bottom: 12px; }
.dh-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.dh-card { display: flex; align-items: center; gap: 8px; border: 1px solid #ebeef5; border-radius: 6px; padding: 6px; }
.dh-thumb { width: 48px; height: 48px; border-radius: 6px; }
.dh-info { flex: 1; min-width: 80px; }
.dh-name { font-size: 13px; font-weight: 600; }
.dh-desc { font-size: 11px; color: #909399; }
.dh-empty { font-size: 12px; color: #c0c4cc; padding: 8px; }
.dh-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dh-file-name { font-size: 12px; color: #67c23a; margin-left: 4px; }

.input-card :deep(.el-form-item__label) { font-size: 13px; color: #606266; padding-bottom: 4px; }
.hint { font-size: 11px; color: #c0c4cc; margin-top: 4px; }

.uploader :deep(.el-upload) { border: 2px dashed #dcdfe6; border-radius: 8px; cursor: pointer; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; transition: border-color .2s; }
.uploader :deep(.el-upload:hover) { border-color: #409eff; }
.upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #909399; font-size: 12px; }
.thumb-wrap { position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; }
.thumb { width: 100%; height: 100%; display: block; }
.thumb-tag { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(64,158,255,.85); color: #fff; font-size: 11px; text-align: center; padding: 2px 0; }

.action-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid #ebeef5; }
.quota-tip { font-size: 12px; color: #909399; }
.quota-tip b { color: #f56c6c; }

.output-card .result-content :deep(h1), .output-card .result-content :deep(h2), .output-card .result-content :deep(h3) { margin: 12px 0 8px; color: #303133; }
.output-card .result-content :deep(p) { margin: 6px 0; line-height: 1.7; color: #606266; }
.output-card .result-content :deep(pre) { background: #f5f7fa; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
.result-video { width: 100%; max-height: 500px; border-radius: 8px; margin-bottom: 12px; }

.empty-state, .loading-state, .failed-state { padding: 80px 0; text-align: center; color: #909399; }
.loading-state p, .failed-state p { margin-top: 12px; font-size: 13px; }
.failed-state p { color: #f56c6c; margin-bottom: 16px; }
</style>
