<template>
  <div class="store-agent">
    <div class="page-header">
      <div class="page-title">
        <el-icon :size="28" class="t-icon"><Cpu /></el-icon>
        <div>
          <h2>门店综合业务 Agent</h2>
          <p>库存分析 · 商品运营 · 销售报表 · 采购建议 · 经营咨询</p>
        </div>
      </div>
    </div>

    <div class="agent-body">
      <!-- 输入区 -->
      <el-card class="input-card" shadow="never">
        <template #header>
          <div class="card-h">
            <el-icon><EditPen /></el-icon>
            <span>业务需求</span>
          </div>
        </template>
        <el-input
          v-model="input"
          type="textarea"
          :rows="5"
          placeholder="用自然语言描述您的业务需求，例如：&#10;• 分析当前库存状态，找出滞销商品和低库存预警&#10;• 查看本月销售情况，给出经营建议&#10;• 生成一份采购建议清单&#10;• 给我门店经营方面的建议"
        />
        <el-button
          type="primary"
          :icon="Loading"
          :loading="loading"
          @click="handleRun"
          size="large"
          style="width: 100%; margin-top: 12px"
        >
          {{ loading ? 'AI 分析中...' : '🚀 执行分析' }}
        </el-button>
      </el-card>

      <!-- 结果区 -->
      <el-card class="result-card" shadow="never">
        <template #header>
          <div class="card-h">
            <el-icon><Document /></el-icon>
            <span>分析结果</span>
            <el-tag v-if="taskId" size="small" type="info" effect="plain" style="margin-left: auto">
              {{ taskId }}
            </el-tag>
          </div>
        </template>

        <div v-if="!result && !loading" class="empty">
          <el-icon :size="56" class="empty-ic"><MagicStick /></el-icon>
          <p>输入业务需求，点击执行分析</p>
          <p class="hint">Agent 会自主调用门店数据工具进行分析</p>
        </div>

        <div v-else-if="loading" class="empty">
          <el-icon :size="40" class="empty-ic spin"><Loading /></el-icon>
          <p>AI 正在分析，可能需要 10-30 秒...</p>
        </div>

        <div v-else class="result markdown-body" v-html="renderResult(result)" />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, EditPen, Document, MagicStick, Cpu } from '@element-plus/icons-vue'
import { runStoreBusinessAgent } from '@/api/agent'

const input = ref('')
const result = ref('')
const loading = ref(false)
const taskId = ref('')

// 简易 markdown 渲染: 换行 / 加粗 / 列表
function renderResult(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/\n/g, '<br>')
}

async function handleRun() {
  if (!input.value.trim()) {
    ElMessage.warning('请输入业务需求')
    return
  }
  loading.value = true
  result.value = ''
  taskId.value = ''
  try {
    const res = await runStoreBusinessAgent(input.value)
    result.value = res.result || '无输出结果'
    taskId.value = res.task_id || ''
    ElMessage.success('分析完成')
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '请求失败'
    result.value = `❌ 分析失败：${msg}\n\n请尝试：\n• 简化您的问题\n• 检查网络连接\n• 稍后重试`
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.store-agent {
  padding-bottom: 20px;
}
.page-header {
  margin-bottom: 16px;
}
.page-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.t-icon {
  color: #409eff;
}
.page-title h2 {
  margin: 0;
  font-size: 20px;
}
.page-title p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 13px;
}
.agent-body {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
}
.card-h {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.empty {
  height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  gap: 8px;
}
.empty-ic {
  color: #c0c4cc;
}
.empty-ic.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.hint {
  font-size: 12px;
  color: #c0c4cc;
}
.result {
  line-height: 1.8;
  color: #303133;
  font-size: 14px;
  word-break: break-word;
}
.result :deep(h2) {
  font-size: 17px;
  margin: 16px 0 8px;
  color: #303133;
}
.result :deep(h3) {
  font-size: 15px;
  margin: 12px 0 6px;
  color: #409eff;
}
.result :deep(strong) {
  color: #f56c6c;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .agent-body {
    grid-template-columns: 1fr;
  }
  .page-title h2 {
    font-size: 18px;
  }
  .empty {
    height: 200px;
  }
}
</style>