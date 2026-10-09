<template>
  <div class="agent-page">
    <div class="page-header">
      <div class="page-title">
        <el-icon :size="26" class="t-icon"><Goods /></el-icon>
        <div>
          <h2>商品运营Agent</h2>
          <p>卖点提炼·商品描述·定价建议</p>
        </div>
      </div>
    </div>
    <div class="agent-body">
      <el-card class="input-card" shadow="never">
        <template #header>
          <div class="card-h"><el-icon><EditPen /></el-icon><span>输入参数</span></div>
        </template>
        <el-form label-position="top">
          <el-form-item label="业务要求">
            <el-input v-model="form.input" type="textarea" :autosize="{ minRows: 5, maxRows: 10 }" placeholder="给施耐德断路器写商品详情描述" />
          </el-form-item>
          <el-button type="primary" :icon="Loading" :loading="loading" @click="handleRun" size="large" style="width:100%">
            {{ loading ? 'AI 思考中...' : '🚀 执行分析' }}
          </el-button>
        </el-form>
      </el-card>
      <el-card class="result-card" shadow="never">
        <template #header>
          <div class="card-h">
            <el-icon><Document /></el-icon>
            <span>AI 输出结果</span>
            <el-tag v-if="taskId" size="small" type="info" effect="plain" style="margin-left:auto;">{{ taskId }}</el-tag>
          </div>
        </template>
        <div v-if="!result && !loading" class="empty">
          <el-icon :size="56" class="empty-ic"><MagicStick /></el-icon>
          <p>填写参数,点击执行分析</p>
          <p class="hint">AI 会基于门店真实数据进行分析</p>
        </div>
        <div v-else-if="loading" class="empty">
          <el-icon :size="40" class="empty-ic spin"><Loading /></el-icon>
          <p>AI 正在调用大模型,可能需要 10-30 秒...</p>
        </div>
        <div v-else class="result markdown-body" v-html="renderMd(result)" />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, EditPen, Document, MagicStick } from '@element-plus/icons-vue'
import { runProductAgent } from '@/api/agent'

const form = ref({ input: '请对当前门店所有商品做运营分析,提炼核心卖点、优化定价' })
const result = ref('')
const loading = ref(false)
const taskId = ref('')

function renderMd(t) {
  if (!t) return ''
  return String(t)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '• $1')
}

async function handleRun() {
  if (!form.value.input.trim()) { ElMessage.warning('请填写业务要求'); return }
  loading.value = true; result.value = ''; taskId.value = ''
  try {
    const res = await runProductAgent(form.value.input)
    result.value = res.result || '无输出'; taskId.value = res.task_id || ''; ElMessage.success('完成')
  } catch (e) { ElMessage.error('请求失败: ' + (e.message || '')) }
  finally { loading.value = false }
}
</script>

<style scoped>
.agent-page{display:flex;flex-direction:column;padding-bottom:20px}
.page-header{margin-bottom:16px}
.page-title{display:flex;align-items:center;gap:12px}
.t-icon{color:#409eff}
.page-title h2{margin:0;font-size:20px}
.page-title p{margin:4px 0 0;color:#909399;font-size:13px}
.agent-body{display:grid;grid-template-columns:360px 1fr;gap:16px}
.input-card,.result-card{display:flex;flex-direction:column}
.input-card :deep(.el-card__body){flex:1}
.result-card :deep(.el-card__body){flex:1}
.card-h{display:flex;align-items:center;gap:6px;font-weight:500}
.empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#909399;gap:8px}
.empty-ic{color:#c0c4cc}
.empty-ic.spin{animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
.hint{font-size:12px;color:#c0c4cc}
.result{line-height:1.8;color:#303133;font-size:14px;white-space:pre-wrap}

@media (max-width: 768px) {
  .agent-body { grid-template-columns: 1fr !important; }
}
</style>

