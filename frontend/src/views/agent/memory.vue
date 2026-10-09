<template>
  <div class="memory-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>店铺长期记忆</h2>
      <p class="desc">跨会话持久化的店铺知识, AI Agent 推理时自动参考高权重记忆。记忆全部由系统自动生成(进销存事件+对话提取), 此页面仅供调试查看, 不可手动修改。</p>
    </div>

    <!-- 筛选栏 -->
    <el-card shadow="never" class="filter-bar">
      <el-row :gutter="12" align="middle">
        <el-col :span="5">
          <el-select v-model="filters.memory_type" placeholder="记忆类型" clearable @change="loadList">
            <el-option label="销售数据" value="sales_data" />
            <el-option label="用户决策" value="user_decision" />
            <el-option label="店铺属性" value="shop_attr" />
            <el-option label="AI总结" value="ai_summary" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <span class="filter-label">权重范围</span>
          <el-input-number v-model="filters.min_importance" :min="0" :max="10" :step="0.5" :controls="false" placeholder="最低" style="width:70px" @change="loadList" />
          <span class="separator">~</span>
          <el-input-number v-model="filters.max_importance" :min="0" :max="10" :step="0.5" :controls="false" placeholder="最高" style="width:70px" @change="loadList" />
        </el-col>
        <el-col :span="6">
          <el-button type="primary" @click="loadList">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button text @click="showInject = true">查看AI注入预览</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 记忆列表表格 -->
    <el-card shadow="never" class="table-card">
      <el-table :data="list" v-loading="loading" stripe style="width: 100%" @row-click="openDetail">
        <el-table-column label="ID" prop="id" width="60" />
        <el-table-column label="记忆类型" width="110">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.memory_type)" size="small">{{ typeLabel(row.memory_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权重" width="100" align="center">
          <template #default="{ row }">
            <span class="importance-val">{{ row.importance }}</span>
            <el-rate v-model="row.importance" :max="10" disabled allow-half size="small" />
          </template>
        </el-table-column>
        <el-table-column label="记忆内容(JSON)" min-width="300">
          <template #default="{ row }">
            <pre class="json-cell">{{ formatJson(row.memory_content) }}</pre>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{ row }">
            <span class="source-text">{{ sourceLabel(row.memory_source) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.create_time) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click.stop="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <!-- 只读模式: 无新增/编辑/删除按钮, 记忆全部由系统自动生成 -->
      </el-table>

      <!-- 分页 -->
      <el-pagination
        class="pager"
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="loadList"
        @current-change="loadList"
      />
    </el-card>

    <!-- 详情弹窗(只读查看) -->
    <el-dialog v-model="detailVisible" title="记忆详情" width="600px">
      <div v-if="currentDetail" class="detail-content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="ID">{{ currentDetail.id }}</el-descriptions-item>
          <el-descriptions-item label="记忆类型">
            <el-tag :type="typeTag(currentDetail.memory_type)" size="small">{{ typeLabel(currentDetail.memory_type) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="权重">{{ currentDetail.importance }} / 10</el-descriptions-item>
          <el-descriptions-item label="数据来源">{{ sourceLabel(currentDetail.memory_source) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(currentDetail.create_time) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(currentDetail.update_time) }}</el-descriptions-item>
          <el-descriptions-item label="记忆内容(JSON)">
            <pre class="json-detail">{{ formatJson(currentDetail.memory_content) }}</pre>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- AI注入预览弹窗 -->
    <el-dialog v-model="showInject" title="AI Prompt 记忆注入预览" width="700px">
      <div v-loading="injectLoading">
        <p class="inject-hint">以下文本会被拼到 AI Agent 的 system prompt 头部, 供推理参考:</p>
        <pre class="inject-text">{{ injectText || '(暂无记忆)' }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getMemories, getMemoryDetail, getInjectPreview } from '@/api/shopMemory'

// ---- 筛选条件 ----
const filters = reactive({
  page: 1,
  pageSize: 10,
  memory_type: '',
  min_importance: undefined,
  max_importance: undefined,
})

// ---- 列表数据 ----
const list = ref([])
const total = ref(0)
const loading = ref(false)

async function loadList() {
  loading.value = true
  try {
    // 组装查询参数, 去掉空值
    const params = { page: filters.page, pageSize: filters.pageSize }
    if (filters.memory_type) params.memory_type = filters.memory_type
    if (filters.min_importance !== undefined && filters.min_importance !== null) params.min_importance = filters.min_importance
    // max_importance 后端暂不支持, 前端过滤
    const data = await getMemories(params)
    let rows = data.list || []
    // 前端做 max_importance 过滤(后端只支持 min)
    if (filters.max_importance !== undefined && filters.max_importance !== null) {
      rows = rows.filter(r => parseFloat(r.importance) <= filters.max_importance)
    }
    list.value = rows
    total.value = data.total || 0
  } catch (e) {
    console.error('加载记忆列表失败:', e)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.memory_type = ''
  filters.min_importance = undefined
  filters.max_importance = undefined
  filters.page = 1
  loadList()
}

// ---- 详情弹窗 ----
const detailVisible = ref(false)
const currentDetail = ref(null)

async function openDetail(row) {
  detailVisible.value = true
  currentDetail.value = null
  try {
    const data = await getMemoryDetail(row.id)
    currentDetail.value = data
  } catch (e) {
    ElMessage.error('加载详情失败')
  }
}

// ---- AI注入预览 ----
const showInject = ref(false)
const injectLoading = ref(false)
const injectText = ref('')

async function loadInject() {
  injectLoading.value = true
  try {
    const data = await getInjectPreview(10)
    injectText.value = data.memory_text || '(暂无记忆)'
  } catch (e) {
    injectText.value = '加载失败'
  } finally {
    injectLoading.value = false
  }
}

// ---- 工具函数 ----
function typeLabel(type) {
  const map = { sales_data: '销售数据', user_decision: '用户决策', shop_attr: '店铺属性', ai_summary: 'AI总结' }
  return map[type] || type
}
function typeTag(type) {
  const map = { sales_data: 'primary', user_decision: 'warning', shop_attr: 'success', ai_summary: 'info' }
  return map[type] || ''
}
function sourceLabel(source) {
  const map = { business_data: '进销存业务', user_chat: '用户对话', agent_log: 'Agent记录' }
  return map[source] || source
}
function formatJson(content) {
  if (!content) return ''
  if (typeof content === 'object') return JSON.stringify(content, null, 2)
  return content
}
function formatTime(t) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

watch(showInject, (val) => { if (val) loadInject() })
onMounted(() => loadList())
</script>

<style scoped>
.memory-page { padding: 0 0 20px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header .desc { margin: 0; color: #999; font-size: 13px; }
.filter-bar { margin-bottom: 12px; }
.filter-label { font-size: 13px; color: #606266; margin-right: 4px; }
.separator { margin: 0 4px; color: #ccc; }
.table-card { margin-bottom: 12px; }
.json-cell {
  margin: 0; max-height: 60px; overflow-y: auto;
  font-size: 12px; line-height: 1.5; color: #606266;
  background: #f5f7fa; padding: 4px 8px; border-radius: 4px;
  white-space: pre-wrap; word-break: break-all;
}
.source-text { font-size: 13px; color: #909399; }
.importance-val { font-weight: 600; color: #e6a23c; margin-right: 4px; }
.pager { margin-top: 16px; display: flex; justify-content: flex-end; }
.inject-hint { color: #909399; font-size: 13px; margin-bottom: 8px; }
.inject-text {
  background: #f5f7fa; padding: 12px; border-radius: 6px;
  font-size: 13px; line-height: 1.6; max-height: 400px;
  overflow-y: auto; white-space: pre-wrap; word-break: break-all;
}
.json-detail {
  margin: 0; font-size: 13px; line-height: 1.5; color: #303133;
  background: #f5f7fa; padding: 12px; border-radius: 6px;
  max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;
}
</style>
